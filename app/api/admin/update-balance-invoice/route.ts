import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const GHL_BASE    = 'https://services.leadconnectorhq.com/invoices/'
const LOCATION_ID = 'KmTuAFWyGn4ijrs1sIzJ'

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

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * Updates an existing (draft) GHL balance invoice in place with a corrected
 * remaining amount, preserving the tax line and adding a description that
 * notes the project total and the deposit already paid.
 */
export async function POST(req: Request) {
  try {
    const {
      estimateId,
      estimateType = 'exterior',
      invoiceId,
      projectTotal,        // tax-inclusive grand total customer agreed to
      depositPaid,         // amount already paid
      remainingTotal,      // tax-inclusive remaining (= projectTotal - depositPaid)
      taxRate,             // decimal, e.g. 0.103
      taxCity,
      contactId,
      contactName,
      contactEmail,
      contactPhone,
      company,
    } = await req.json() as {
      estimateId?:     string
      estimateType?:   string
      invoiceId:       string
      projectTotal:    number
      depositPaid:     number
      remainingTotal:  number
      taxRate:         number
      taxCity:         string
      contactId:       string
      contactName:     string
      contactEmail:    string
      contactPhone:    string
      company: {
        name: string; phone: string; email: string
        website: string; streetAddress: string; cityStateZip: string
      }
    }

    if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })

    const token     = await getGhlToken()
    const issueDate = new Date().toISOString().slice(0, 10)

    // Back out pre-tax so item + exclusive tax == remainingTotal exactly
    const divisor = 1 + (taxRate || 0)
    const preTax  = Math.round((remainingTotal / divisor) * 100) / 100

    const taxEntry = taxRate > 0 ? [{
      _id:         newObjectId(),
      taxId:       newObjectId(),
      name:        taxCity ? `Sales Tax - ${taxCity} ${parseFloat((taxRate * 100).toFixed(4))}%` : `Sales Tax ${parseFloat((taxRate * 100).toFixed(4))}%`,
      rate:        parseFloat((taxRate * 100).toFixed(4)),
      calculation: 'exclusive',
      description: '',
    }] : []

    const description =
      `Project Total: ${usd(projectTotal)}\n` +
      `Deposit already paid: ${usd(depositPaid)}\n` +
      `Remaining balance due on completion: ${usd(remainingTotal)}`

    const invoiceItem = {
      name:        'Balance Due on Completion',
      description,
      currency:    'USD',
      amount:      preTax,
      qty:         1,
      type:        'one_time',
      ...(taxEntry.length ? { taxes: taxEntry } : {}),
    }

    const body = {
      altId:    LOCATION_ID,
      altType:  'location',
      name:     `Balance Due — ${contactName}`,
      title:    'INVOICE',
      currency: 'USD',
      liveMode: true,
      issueDate,
      dueDate:  issueDate,
      businessDetails: {
        logoUrl: 'https://assets.cdn.filesafe.space/KmTuAFWyGn4ijrs1sIzJ/media/682e521b6595bee932068728.png',
        name: company.name, phoneNo: company.phone, website: company.website,
        address: { addressLine1: company.streetAddress, city: company.cityStateZip },
      },
      contactDetails: {
        id:      contactId,
        name:    contactName  || '',
        phoneNo: toE164(contactPhone || ''),
        email:   contactEmail || '',
      },
      // GHL update (PUT) expects `invoiceItems`; include `items` too for safety
      invoiceItems: [invoiceItem],
      items:        [invoiceItem],
      discount:   { value: 0, type: 'percentage' },
      termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',
    }

    const headers = { Authorization: `Bearer ${token}`, Version: '2023-02-21', 'Content-Type': 'application/json' }
    const res     = await fetch(`${GHL_BASE}${invoiceId}`, { method: 'PUT', headers, body: JSON.stringify(body) })
    const text    = await res.text()
    if (!res.ok) throw new Error(`GHL update error ${res.status}: ${text}`)

    const json = JSON.parse(text) as Record<string, unknown>
    const inv  = (json.invoice ?? json) as Record<string, unknown>
    const invoiceUrl = (inv.invoiceUrl ?? `https://link.fastpaydirect.com/invoice/${invoiceId}`) as string

    // Record the agreed pricing back on the estimate
    if (estimateId) {
      const col = estimateType === 'interior' ? 'interiorEstimates' : estimateType === 'cabinet' ? 'cabinetEstimates' : 'estimates'
      await adminDb.collection(col).doc(estimateId).update({
        signedGrandTotal: projectTotal,
        signedBalanceDue: remainingTotal,
        depositPaid:      true,
        depositPaidAmount: depositPaid,
        correctedAt:      FieldValue.serverTimestamp(),
        updatedAt:        FieldValue.serverTimestamp(),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, invoiceUrl, preTax, total: remainingTotal })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[update-balance-invoice]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
