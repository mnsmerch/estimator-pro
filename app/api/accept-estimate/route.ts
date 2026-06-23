import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const COLLECTIONS: Record<string, string> = {
  exterior: 'estimates',
  interior: 'interiorEstimates',
  cabinet:  'cabinetEstimates',
}

const GHL_WEBHOOK = 'https://services.leadconnectorhq.com/invoices/'
const LOCATION_ID = 'KmTuAFWyGn4ijrs1sIzJ'
// Notification webhook fired whenever an estimate is signed
const SIGNED_WEBHOOK = 'https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/b8cc789f-69eb-4773-9f89-a7ac6be61580'

async function getGhlToken(): Promise<string> {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const raw = process.env.GHL_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GHL_SERVICE_ACCOUNT_JSON not set')
  const existing = getApps().find(a => a.name === 'ghl')
  const app = existing ?? initializeApp({ credential: cert(JSON.parse(raw)) }, 'ghl')
  const db = getFirestore(app)
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
    const {
      estimateId,
      estimateType = 'exterior',
      signatureName,
      signatureDataUrl,
      // Invoice data — only present when contactId is set
      contactId,
      contactName,
      contactEmail,
      contactPhone,
      depositAmount,
      balanceDue,
      depositPercent,
      grandTotal,
      itemLabel,
      taxRate,
      taxCity,
      estimateNumber,
      company,
    } = await req.json() as {
      estimateId:     string
      estimateType?:  string
      signatureName:  string
      signatureDataUrl?: string
      contactId?:     string
      contactName?:   string
      contactEmail?:  string
      contactPhone?:  string
      depositAmount?: number
      balanceDue?:    number
      depositPercent?: number
      grandTotal?:    number
      itemLabel?:     string
      taxRate?:        number | null
      taxCity?:        string
      estimateNumber?: number | null
      company?: {
        name: string; phone: string; email: string
        website: string; streetAddress: string; cityStateZip: string
      }
    }

    const collection = COLLECTIONS[estimateType] ?? 'estimates'

    // 1. Save signature + approve + store pricing so attach-contact can use it later
    await adminDb.collection(collection).doc(estimateId).update({
      status:           'approved',
      signatureName,
      signatureDate:    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      ...(signatureDataUrl ? { signatureDataUrl } : {}),
      // Store pricing at signing time so webhook callbacks can create invoices later
      ...(grandTotal   != null ? { signedGrandTotal:    grandTotal }   : {}),
      ...(depositAmount != null ? { signedDepositAmount: depositAmount } : {}),
      ...(balanceDue   != null ? { signedBalanceDue:    balanceDue }   : {}),
      ...(depositPercent != null ? { signedDepositPercent: depositPercent } : {}),
      ...(taxRate      != null ? { signedTaxRate:       taxRate }      : {}),
      ...(taxCity               ? { signedTaxCity:      taxCity }      : {}),
      updatedAt:        FieldValue.serverTimestamp(),
    })

    // 1b. Fire "estimate signed" notification webhook (non-blocking)
    try {
      const estSnap = await adminDb.collection(collection).doc(estimateId).get()
      const est     = (estSnap.data() ?? {}) as Record<string, unknown>
      await fetch(SIGNED_WEBHOOK, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName:    contactName ?? est.clientName ?? '',
          estimateNumber: est.estimateNumber ?? '',
          phone:          contactPhone ?? est.clientPhone ?? '',
          email:          contactEmail ?? est.clientEmail ?? '',
          estimateType,
          estimateId,
        }),
      })
    } catch (whErr) {
      console.error('[accept-estimate] signed webhook failed:', whErr)
    }

    // 2. Create GHL invoices if contact info provided
    let depositInvoiceUrl: string | null = null

    if (contactId && grandTotal && grandTotal > 0 && depositAmount != null && balanceDue != null && company) {
      try {
        const token      = await getGhlToken()
        const issueDate  = new Date().toISOString().slice(0, 10)
        const depositPct = Math.round((depositPercent ?? 0.2) * 100)
        const totalStr   = grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        const tax        = taxRate ? { rate: taxRate, city: taxCity ?? '' } : null
        const divisor    = tax ? (1 + tax.rate) : 1
        const preTaxDep  = Math.round((depositAmount / divisor) * 100) / 100
        const preTaxBal  = Math.round((balanceDue   / divisor) * 100) / 100

        const contactDetails = {
          id:      contactId,
          name:    contactName     || '',
          phoneNo: toE164(contactPhone || ''),
          email:   contactEmail    || '',
        }

        const taxEntry = tax ? [{
          _id:         newObjectId(),
          taxId:       newObjectId(),
          name:        tax.city ? `Sales Tax - ${tax.city} ${parseFloat((tax.rate * 100).toFixed(4))}%` : `Sales Tax ${parseFloat((tax.rate * 100).toFixed(4))}%`,
          rate:        parseFloat((tax.rate * 100).toFixed(4)),
          calculation: 'exclusive',
          description: '',
        }] : []

        const estNumStr = estimateNumber ? String(estimateNumber) : null
        const buildBody = (name: string, desc: string, amount: number, dueDate?: string, withFee?: boolean) => ({
          altId: LOCATION_ID, altType: 'location',
          name: estNumStr ? `#${estNumStr} — ${name}` : name,
          title: 'INVOICE', currency: 'USD', liveMode: true,
          ...(estNumStr ? { invoiceNumber: estNumStr } : {}),
          issueDate, ...(dueDate ? { dueDate } : {}),
          businessDetails: {
            logoUrl: 'https://assets.cdn.filesafe.space/KmTuAFWyGn4ijrs1sIzJ/media/682e521b6595bee932068728.png',
            name: company.name, phoneNo: company.phone, website: company.website,
            address: { addressLine1: company.streetAddress, city: company.cityStateZip },
          },
          contactDetails,
          items: [{ name: itemLabel || 'Painting Services', description: desc, currency: 'USD', amount, qty: 1, type: 'one_time', ...(taxEntry.length ? { taxes: taxEntry } : {}) }],
          discount: { value: 0, type: 'percentage' },
          termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',
          sentTo: { email: contactEmail ? [contactEmail] : [], phoneNo: contactDetails.phoneNo ? [contactDetails.phoneNo] : [] },
          ...(withFee ? { miscellaneousCharges: { charges: [{ _id: newObjectId(), name: '2% Processing Fee', charge: 2, amount: parseFloat((amount * 0.02).toFixed(2)), enabled: true }], collectedMiscellaneousCharges: parseFloat((amount * 0.02).toFixed(2)) } } : {}),
        })

        const headers = { Authorization: `Bearer ${token}`, Version: '2023-02-21', 'Content-Type': 'application/json' }

        // Create deposit invoice
        const depRes  = await fetch(GHL_WEBHOOK, { method: 'POST', headers, body: JSON.stringify(buildBody(`Deposit (${depositPct}%) — ${contactName}`, `Deposit for project totaling ${totalStr}`, preTaxDep, issueDate, true)) })
        const depJson = await depRes.json() as Record<string, unknown>
        const depInv  = (depJson.invoice ?? depJson) as Record<string, unknown>
        const depId   = (depInv._id ?? depInv.id ?? '') as string
        depositInvoiceUrl = (depInv.invoiceUrl ?? `https://link.fastpaydirect.com/invoice/${depId}`) as string

        // Send deposit invoice
        await fetch(`${GHL_WEBHOOK}${depId}/send`, {
          method: 'POST', headers,
          body: JSON.stringify({ altId: LOCATION_ID, altType: 'location', action: 'sms_and_email', liveMode: true, sentFrom: { fromName: company.name, fromEmail: company.email } }),
        })

        // Create balance invoice (draft) and store its ID for future change orders
        const balRes  = await fetch(GHL_WEBHOOK, { method: 'POST', headers, body: JSON.stringify(buildBody(`Balance Due — ${contactName}`, `Balance due on completion for project totaling ${totalStr}`, preTaxBal)) })
        const balJson = await balRes.json() as Record<string, unknown>
        const balInv  = (balJson.invoice ?? balJson) as Record<string, unknown>
        const balId   = (balInv._id ?? balInv.id ?? '') as string

        // Save invoice IDs so the paid-webhook + change orders can match them later
        await adminDb.collection(collection).doc(estimateId).update({
          ...(depId ? { depositInvoiceId: depId } : {}),
          ...(balId ? { balanceInvoiceId: balId } : {}),
          invoiceCreated: true,
        })

        console.log('[accept-estimate] Invoices created for', estimateId, contactId)
      } catch (invoiceErr) {
        // Log but don't fail the whole accept — signature is already saved
        console.error('[accept-estimate] Invoice creation failed:', invoiceErr)
        return NextResponse.json({
          success: true,
          depositInvoiceUrl: null,
          invoiceError: invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr),
        })
      }
    }

    return NextResponse.json({ success: true, depositInvoiceUrl })
  } catch (err) {
    console.error('[accept-estimate] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
