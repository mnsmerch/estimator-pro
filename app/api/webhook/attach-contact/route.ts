/**
 * POST /api/webhook/attach-contact
 *
 * Called by GHL after it finds or creates a contact for a manually-created estimate.
 * GHL sends back the contactId + the original pricing data.
 * This endpoint:
 *   1. Updates the estimate's clientContactId in Firestore
 *   2. Creates the deposit + balance invoices in GHL
 */

import { NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const GHL_WEBHOOK  = 'https://services.leadconnectorhq.com/invoices/'
const LOCATION_ID  = 'KmTuAFWyGn4ijrs1sIzJ'

function getAdminDb() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const existing = getApps().find(a => a.name === '[DEFAULT]')
  if (!existing) initializeApp({ credential: cert(JSON.parse(raw)) })
  return getFirestore()
}

async function getGhlToken(): Promise<string> {
  const { initializeApp: initApp, cert: certFn, getApps: getAppsF } = await import('firebase-admin/app')
  const { getFirestore: getFs } = await import('firebase-admin/firestore')
  const raw = process.env.GHL_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GHL_SERVICE_ACCOUNT_JSON not set')
  const existing = getAppsF().find(a => a.name === 'ghl')
  const app = existing ?? initApp({ credential: certFn(JSON.parse(raw)) }, 'ghl')
  const db  = getFs(app)
  const snap = await db.collection('ghl_location_tokens').doc(LOCATION_ID).get()
  if (!snap.exists) throw new Error('GHL token not found')
  return snap.data()!.access_token as string
}

function newObjectId(): string {
  const ts     = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const random = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const counter = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0')
  return ts + random + counter
}

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 7) return `+${digits}`
  return ''
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      // Required — sent back by GHL
      estimateId:      string
      contactId:       string
      // Contact info
      contactName?:    string
      contactEmail?:   string
      contactPhone?:   string
      // Pricing — GHL echoes back what we originally sent
      grandTotal?:     number
      depositAmount?:  number
      balanceDue?:     number
      depositPercent?: number
      taxRate?:        number
      taxCity?:        string
      // Company info (optional — we can fetch from settings if missing)
      companyName?:    string
      companyPhone?:   string
      companyEmail?:   string
      companyWebsite?: string
      companyAddress?: string
    }

    const { estimateId, contactId } = body
    if (!estimateId || !contactId) {
      return NextResponse.json({ error: 'estimateId and contactId are required' }, { status: 400 })
    }

    const db = getAdminDb()

    // Find which collection this estimate belongs to
    let col = 'estimates'
    let estSnap = await db.collection('estimates').doc(estimateId).get()
    if (!estSnap.exists) {
      estSnap = await db.collection('interiorEstimates').doc(estimateId).get()
      col = 'interiorEstimates'
    }
    if (!estSnap.exists) {
      estSnap = await db.collection('cabinetEstimates').doc(estimateId).get()
      col = 'cabinetEstimates'
    }

    // 1. Update the estimate with the new contactId
    await db.collection(col).doc(estimateId).update({
      clientContactId: contactId,
      updatedAt:       FieldValue.serverTimestamp(),
    })

    // 2. Get pricing — prefer what GHL sent back, fall back to what was stored at signing
    let grandTotal    = body.grandTotal
    let depositAmount = body.depositAmount
    let balanceDue    = body.balanceDue
    let depositPercent = body.depositPercent
    let taxRate        = body.taxRate
    let taxCity        = body.taxCity

    if (!grandTotal || grandTotal <= 0) {
      // GHL didn't echo pricing back — read what we stored at signing time
      try {
        const snap = await db.collection(col).doc(estimateId).get()
        if (snap.exists) {
          const d = snap.data()!
          grandTotal    = d.signedGrandTotal    ?? grandTotal
          depositAmount = d.signedDepositAmount ?? depositAmount
          balanceDue    = d.signedBalanceDue    ?? balanceDue
          depositPercent = d.signedDepositPercent ?? depositPercent
          taxRate       = d.signedTaxRate       ?? taxRate
          taxCity       = d.signedTaxCity       ?? taxCity
          // Also pull contact info from estimate if not in payload
          if (!body.contactName)  body.contactName  = d.clientName  ?? ''
          if (!body.contactEmail) body.contactEmail = d.clientEmail ?? ''
          if (!body.contactPhone) body.contactPhone = d.clientPhone ?? ''
        }
      } catch (fetchErr) {
        console.warn('[attach-contact] Could not fetch stored pricing:', fetchErr)
      }
    }

    if (!grandTotal || grandTotal <= 0 || depositAmount == null || balanceDue == null) {
      console.log('[attach-contact] Contact linked, no invoice data available:', estimateId, contactId)
      return NextResponse.json({ success: true, invoicesCreated: false })
    }

    // Fetch company settings if not provided
    let companyName    = body.companyName    ?? 'Vanhousing Painters LLC'
    let companyPhone   = body.companyPhone   ?? ''
    let companyEmail   = body.companyEmail   ?? ''
    let companyWebsite = body.companyWebsite ?? ''
    let companyAddress = body.companyAddress ?? ''

    if (!body.companyName) {
      try {
        const snap = await db.collection('settings').doc('company').get()
        if (snap.exists) {
          const c = snap.data()!
          companyName    = c.name         ?? companyName
          companyPhone   = c.phone        ?? companyPhone
          companyEmail   = c.email        ?? companyEmail
          companyWebsite = c.website      ?? companyWebsite
          companyAddress = `${c.streetAddress ?? ''}, ${c.cityStateZip ?? ''}`.trim().replace(/^,\s*/, '')
        }
      } catch { /* use defaults */ }
    }

    const token       = await getGhlToken()
    const issueDate   = new Date().toISOString().slice(0, 10)
    // Use the locally-scoped variables (populated from Firestore fallback), NOT body.*
    const depositPct  = Math.round((depositPercent ?? 0.20) * 100)
    const totalStr    = grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    const tax         = (taxRate && taxRate > 0) ? { rate: taxRate, city: taxCity ?? '' } : null
    const divisor     = tax ? (1 + tax.rate) : 1
    const preTaxDep   = Math.round((depositAmount  / divisor) * 100) / 100
    const preTaxBal   = Math.round((balanceDue     / divisor) * 100) / 100

    const contactDetails = {
      id:      contactId,
      name:    body.contactName     ?? '',
      phoneNo: toE164(body.contactPhone ?? ''),
      email:   body.contactEmail    ?? '',
    }

    const taxEntry = tax ? [{
      _id:         newObjectId(),
      taxId:       newObjectId(),
      name:        tax.city ? `Sales Tax - ${tax.city} ${parseFloat((tax.rate * 100).toFixed(4))}%` : `Sales Tax ${parseFloat((tax.rate * 100).toFixed(4))}%`,
      rate:        parseFloat((tax.rate * 100).toFixed(4)),
      calculation: 'exclusive',
      description: '',
    }] : []

    const headers = {
      Authorization:  `Bearer ${token}`,
      Version:        '2023-02-21',
      'Content-Type': 'application/json',
    }

    const buildBody = (name: string, desc: string, amount: number, dueDate?: string) => ({
      altId: LOCATION_ID, altType: 'location',
      name, title: 'INVOICE', currency: 'USD', liveMode: true,
      issueDate, ...(dueDate ? { dueDate } : {}),
      businessDetails: {
        logoUrl:    'https://assets.cdn.filesafe.space/KmTuAFWyGn4ijrs1sIzJ/media/682e521b6595bee932068728.png',
        name:       companyName,
        phoneNo:    companyPhone,
        website:    companyWebsite,
        address:    { addressLine1: companyAddress },
      },
      contactDetails,
      items: [{
        name:        'Painting Services',
        description: desc,
        currency:    'USD',
        amount,
        qty:         1,
        type:        'one_time',
        ...(taxEntry.length ? { taxes: taxEntry } : {}),
      }],
      discount: { value: 0, type: 'percentage' },
      termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',
      sentTo: {
        email:   contactDetails.email   ? [contactDetails.email]   : [],
        phoneNo: contactDetails.phoneNo ? [contactDetails.phoneNo] : [],
      },
    })

    // Create & send deposit invoice
    const depRes  = await fetch(GHL_WEBHOOK, { method: 'POST', headers, body: JSON.stringify(buildBody(
      `Deposit (${depositPct}%) — ${contactDetails.name}`,
      `Deposit for project totaling ${totalStr}`,
      preTaxDep,
      issueDate,
    )) })
    const depJson = await depRes.json() as Record<string, unknown>
    const depInv  = (depJson.invoice ?? depJson) as Record<string, unknown>
    const depId   = (depInv._id ?? depInv.id ?? '') as string

    // Send deposit invoice
    if (depId) {
      const sendRes = await fetch(`${GHL_WEBHOOK}${depId}/send`, {
        method: 'POST', headers,
        body: JSON.stringify({
          altId: LOCATION_ID, altType: 'location',
          action: 'sms_and_email', liveMode: true,
          sentFrom: { fromName: companyName, fromEmail: companyEmail },
        }),
      })
      if (!sendRes.ok) {
        const sendErr = await sendRes.text().catch(() => '')
        console.error('[attach-contact] Invoice send failed:', sendRes.status, sendErr)
      } else {
        console.log('[attach-contact] Invoice sent successfully for', estimateId)
      }
    } else {
      console.error('[attach-contact] No depId returned from invoice creation — cannot send')
    }

    // Create balance invoice (draft) and store its ID for future change orders
    const balRes  = await fetch(GHL_WEBHOOK, { method: 'POST', headers, body: JSON.stringify(buildBody(
      `Balance Due — ${contactDetails.name}`,
      `Balance due on completion for project totaling ${totalStr}`,
      preTaxBal,
    )) })
    const balJson = await balRes.json() as Record<string, unknown>
    const balInv  = (balJson.invoice ?? balJson) as Record<string, unknown>
    const balId   = (balInv._id ?? balInv.id ?? '') as string

    // Build deposit invoice URL from response
    const depositInvoiceUrl = (depInv.invoiceUrl ?? (depId ? `https://link.fastpaydirect.com/invoice/${depId}` : null)) as string | null

    // Mark the estimate so the proposal page can detect success via polling
    try {
      await db.collection(col).doc(estimateId).update({
        invoiceCreated:    true,
        ...(depId ? { depositInvoiceId: depId } : {}),
        ...(balId ? { balanceInvoiceId: balId } : {}),
        depositInvoiceUrl: depositInvoiceUrl ?? '',
        updatedAt:         FieldValue.serverTimestamp(),
      })
    } catch (markErr) {
      console.warn('[attach-contact] Could not mark invoice created:', markErr)
    }

    console.log('[attach-contact] Contact linked + invoices created:', estimateId, contactId)
    return NextResponse.json({ success: true, invoicesCreated: true, depositInvoiceUrl })

  } catch (err) {
    console.error('[attach-contact] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
