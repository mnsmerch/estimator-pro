import { NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const GHL_INVOICES  = 'https://services.leadconnectorhq.com/invoices/'
const LOCATION_ID   = 'KmTuAFWyGn4ijrs1sIzJ'

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
  const ts      = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const random  = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const counter = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0')
  return ts + random + counter
}

/** Find the balance invoice for a contact in GHL — tries multiple status filters */
async function findBalanceInvoiceId(contactId: string, token: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, Version: '2023-02-21' }
  // Try fetching all invoices for this contact (no status filter — GHL may paginate differently)
  const attempts = [
    `${GHL_INVOICES}?altId=${LOCATION_ID}&altType=location&contactId=${contactId}&limit=25`,
    `${GHL_INVOICES}?altId=${LOCATION_ID}&altType=location&contactId=${contactId}&paymentMode=live&limit=25`,
  ]
  for (const url of attempts) {
    try {
      const res  = await fetch(url, { headers })
      if (!res.ok) { console.warn('[change-order] GHL search status:', res.status); continue }
      const json = await res.json() as { invoices?: { _id?: string; id?: string; name?: string; status?: string }[] }
      const invoices = json.invoices ?? []
      console.log('[change-order] Found invoices for contact:', invoices.map(i => `${i._id ?? i.id} name=${i.name} status=${i.status}`))
      // Prefer one whose name contains 'Balance Due' and is not paid
      const balInv = invoices.find(i =>
        (i.name ?? '').toLowerCase().includes('balance') &&
        !['paid','void'].includes((i.status ?? '').toLowerCase())
      ) ?? invoices.find(i => (i.name ?? '').toLowerCase().includes('balance'))
      if (balInv) return balInv._id ?? balInv.id ?? null
    } catch (e) {
      console.warn('[change-order] Search attempt failed:', e)
    }
  }
  return null
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      estimateId:        string
      items:             { id: string; description: string; price: number }[]
      notes?:            string
      balanceInvoiceId?: string   // optional override — skip search
    }

    const { estimateId, items, notes } = body
    if (!estimateId || !items?.length) {
      return NextResponse.json({ error: 'estimateId and items required' }, { status: 400 })
    }

    const db = getAdminDb()
    // Try all three collections
    const COLLECTIONS = ['estimates', 'interiorEstimates', 'cabinetEstimates']
    let snap = await db.collection('estimates').doc(estimateId).get()
    let collection = 'estimates'
    if (!snap.exists) {
      snap = await db.collection('interiorEstimates').doc(estimateId).get()
      collection = 'interiorEstimates'
    }
    if (!snap.exists) {
      snap = await db.collection('cabinetEstimates').doc(estimateId).get()
      collection = 'cabinetEstimates'
    }
    void COLLECTIONS // suppress unused warning
    if (!snap.exists) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

    const est = snap.data()!
    const changeOrderTotal    = items.reduce((s, i) => s + (i.price || 0), 0)
    const signedGrandTotal    = (est.signedGrandTotal    ?? 0) as number
    const signedDepositAmount = (est.signedDepositAmount ?? 0) as number
    const signedTaxRate       = (est.signedTaxRate       ?? 0) as number
    const newGrandTotal       = signedGrandTotal + changeOrderTotal
    const divisor             = signedTaxRate > 0 ? (1 + signedTaxRate) : 1
    const newBalanceDue       = Math.round((newGrandTotal - signedDepositAmount) * 100) / 100

    // 1. Save change order to Firestore
    await db.collection(collection).doc(estimateId).update({
      changeOrders:     items,
      changeOrderDate:  new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      changeOrderNotes: notes ?? '',
      isModified:       true,
      updatedAt:        FieldValue.serverTimestamp(),
    })

    // 2. Update GHL balance invoice
    const contactId = est.clientContactId as string | undefined
    let ghlUpdateResult = 'skipped'

    if (contactId) {
      try {
        const token = await getGhlToken()
        const headers = { Authorization: `Bearer ${token}`, Version: '2023-02-21', 'Content-Type': 'application/json' }

        // Find the balance invoice ID — use override, then stored, then search GHL
        let balanceInvoiceId = body.balanceInvoiceId || (est.balanceInvoiceId as string | undefined)
        if (!balanceInvoiceId) {
          balanceInvoiceId = (await findBalanceInvoiceId(contactId, token)) ?? undefined
          // Store it for next time
          if (balanceInvoiceId) {
            await db.collection(collection).doc(estimateId).update({ balanceInvoiceId })
          }
        }

        if (balanceInvoiceId) {
          // Fetch company settings for businessDetails
          let companyName = 'Vanhousing Painters LLC', companyPhone = '', companyEmail = '', companyWebsite = '', companyAddress = ''
          try {
            const compSnap = await db.collection('settings').doc('company').get()
            if (compSnap.exists) {
              const c = compSnap.data()!
              companyName    = c.name         ?? companyName
              companyPhone   = c.phone        ?? companyPhone
              companyEmail   = c.email        ?? companyEmail
              companyWebsite = c.website      ?? companyWebsite
              companyAddress = `${c.streetAddress ?? ''}, ${c.cityStateZip ?? ''}`.trim().replace(/^,\s*/, '')
            }
          } catch { /* use defaults */ }

          const contactDetails = {
            id:      contactId,
            name:    est.clientName     ?? '',
            phoneNo: (est.clientPhone as string ?? '').replace(/\D/g,'').replace(/^(\d{10})$/, '+1$1'),
            email:   est.clientEmail    ?? '',
          }

          const originalBalPreTax = Math.round(((signedGrandTotal - signedDepositAmount) / divisor) * 100) / 100
          const invoiceItems = [
            {
              name:        'Original Balance Due',
              description: 'Remaining balance on original contract',
              currency:    'USD',
              amount:      originalBalPreTax,
              qty:         1,
              type:        'one_time',
            },
            ...items.map(item => ({
              name:        item.description,
              description: 'Change Order',
              currency:    'USD',
              amount:      Math.round(item.price / divisor * 100) / 100,
              qty:         1,
              type:        'one_time',
            })),
          ]

          const updateRes = await fetch(`${GHL_INVOICES}${balanceInvoiceId}`, {
            method:  'PUT',
            headers,
            body:    JSON.stringify({
              altId:    LOCATION_ID,
              altType:  'location',
              name:     `Balance Due (Modified) — ${est.clientName ?? ''}`,
              title:    'INVOICE',
              currency: 'USD',
              liveMode: true,
              issueDate: new Date().toISOString().slice(0, 10),
              dueDate:   new Date().toISOString().slice(0, 10),
              businessDetails: {
                logoUrl:    'https://assets.cdn.filesafe.space/KmTuAFWyGn4ijrs1sIzJ/media/682e521b6595bee932068728.png',
                name:       companyName,
                phoneNo:    companyPhone,
                website:    companyWebsite,
                address:    { addressLine1: companyAddress },
              },
              contactDetails,
              invoiceItems,
              discount: { value: 0, type: 'percentage' },
              termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',
              sentTo: {
                email:   contactDetails.email   ? [contactDetails.email]   : [],
                phoneNo: contactDetails.phoneNo ? [contactDetails.phoneNo] : [],
              },
            }),
          })

          if (updateRes.ok) {
            ghlUpdateResult = 'updated'
          } else {
            const errText = await updateRes.text().catch(() => '')
            console.error('[change-order] GHL PUT failed:', updateRes.status, errText)
            ghlUpdateResult = `ghl_error_${updateRes.status}: ${errText.slice(0, 300)}`
          }
        } else {
          ghlUpdateResult = 'invoice_not_found'
          console.warn('[change-order] No balance invoice found for contact', contactId)
        }
      } catch (ghlErr) {
        console.error('[change-order] GHL error:', ghlErr)
        ghlUpdateResult = 'error'
      }
    }

    return NextResponse.json({
      success:          true,
      changeOrderTotal,
      newGrandTotal,
      newBalanceDue,
      ghlUpdateResult,
    })
  } catch (err) {
    console.error('[change-order] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
