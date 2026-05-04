import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Generate a valid MongoDB ObjectID-format string (for tax _id / taxId fields)
function newObjectId(): string {
  const ts      = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const random  = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const counter = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0')
  return ts + random + counter
}

// Normalize any phone string to E.164 (+12065551234). Returns '' if invalid.
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 7) return `+${digits}`
  return ''
}

// ── Firebase Admin (access-vlad project for GHL tokens) ──────────────────────

function getGhlDb() {
  const raw = process.env.GHL_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GHL_SERVICE_ACCOUNT_JSON not set')
  const existing = getApps().find(a => a.name === 'ghl')
  const app = existing ?? initializeApp({ credential: cert(JSON.parse(raw)) }, 'ghl')
  return getFirestore(app)
}

async function getGhlLocationToken(): Promise<string> {
  const db = getGhlDb()
  const snap = await db.collection('ghl_location_tokens').doc('KmTuAFWyGn4ijrs1sIzJ').get()
  if (!snap.exists) throw new Error('GHL location token doc not found')
  return (snap.data()!.access_token) as string
}

// ── GHL helpers ───────────────────────────────────────────────────────────────

const LOCATION_ID = 'KmTuAFWyGn4ijrs1sIzJ'

interface TaxInfo {
  rate: number
  city: string
}

interface ContactDetails {
  id:      string
  name:    string
  phoneNo: string
  email:   string
}

interface CompanyDetails {
  name:          string
  phone:         string
  email:         string
  website:       string
  streetAddress: string
  cityStateZip:  string
}

function buildTaxEntry(tax: TaxInfo) {
  const ratePct = parseFloat((tax.rate * 100).toFixed(4))
  const label   = tax.city ? `Sales Tax - ${tax.city} ${ratePct}%` : `Sales Tax ${ratePct}%`
  return {
    _id:         newObjectId(),
    taxId:       newObjectId(),
    name:        label,
    rate:        ratePct,
    calculation: 'exclusive',
    description: label,
  }
}

async function createGhlInvoice(
  token:       string,
  invoiceName: string,
  itemName:    string,
  itemDesc:    string,
  amount:      number,
  tax:         TaxInfo | null,
  contact:     ContactDetails,
  company:     CompanyDetails,
  issueDate:   string,
): Promise<{ id: string; invoiceNumber: string; invoiceUrl: string }> {
  const item = {
    name:        itemName,
    description: itemDesc,
    currency:    'USD',
    amount:      Math.round(amount * 100) / 100,
    qty:         1,
    type:        'one_time',
    ...(tax ? { taxes: [buildTaxEntry(tax)] } : {}),
  }

  const body = {
    altId:    LOCATION_ID,
    altType:  'location',
    name:     invoiceName,
    title:    'INVOICE',
    currency: 'USD',
    liveMode: true,
    issueDate,

    businessDetails: {
      logoUrl: 'https://assets.cdn.filesafe.space/KmTuAFWyGn4ijrs1sIzJ/media/682e521b6595bee932068728.png',
      name:    company.name,
      phoneNo: company.phone,
      website: company.website,
      address: {
        addressLine1: company.streetAddress,
        city:         company.cityStateZip,
      },
    },

    contactDetails: {
      id:      contact.id,
      name:    contact.name,
      phoneNo: contact.phoneNo || '',
      email:   contact.email  || '',
    },

    items: [item],

    discount: {
      value: 0,
      type:  'percentage',
    },

    termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',

    sentTo: {
      email:   contact.email   ? [contact.email]   : [],
      phoneNo: contact.phoneNo ? [contact.phoneNo] : [],
    },
  }

  const res = await fetch('https://services.leadconnectorhq.com/invoices/', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      Version:        '2023-02-21',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`GHL invoice error ${res.status}: ${text}`)

  const json = JSON.parse(text) as Record<string, unknown>
  const inv  = (json.invoice ?? json) as Record<string, unknown>
  const id   = (inv._id ?? inv.id ?? '') as string

  // GHL invoice public URL
  const invoiceUrl = (inv.invoiceUrl ?? inv.url ?? `https://invoice.gohighlevel.com/v2/preview/${id}`) as string

  return { id, invoiceNumber: (inv.invoiceNumber ?? '') as string, invoiceUrl }
}

// Send an already-created invoice so it emails the contact and becomes payable
async function getGhlLocationUserId(token: string): Promise<string> {
  const res = await fetch(
    `https://services.leadconnectorhq.com/users/search?locationId=${LOCATION_ID}&limit=1`,
    { headers: { Authorization: `Bearer ${token}`, Version: '2023-02-21' } }
  )
  if (!res.ok) throw new Error(`GHL users search failed: ${res.status}`)
  const json = await res.json() as { users?: { id: string }[] }
  const userId = json.users?.[0]?.id
  if (!userId) throw new Error('No GHL users found for location')
  return userId
}

async function sendGhlInvoice(token: string, invoiceId: string, userId: string): Promise<void> {
  const res = await fetch(`https://services.leadconnectorhq.com/invoices/${invoiceId}/send`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      Version:        '2023-02-21',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      altId:    LOCATION_ID,
      altType:  'location',
      userId,
      action:   'sms_and_email',
      liveMode: true,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GHL send invoice error ${res.status}: ${txt}`)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
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
      company,
    } = await req.json() as {
      contactId:      string
      contactName:    string
      contactEmail:   string
      contactPhone:   string
      depositAmount:  number
      balanceDue:     number
      depositPercent: number
      grandTotal:     number
      itemLabel:      string
      taxRate?:       number | null
      taxCity?:       string
      company:        CompanyDetails
    }

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
    }

    const token      = await getGhlLocationToken()
    const issueDate  = new Date().toISOString().slice(0, 10)
    const depositPct = Math.round((depositPercent ?? 0.2) * 100)

    const contact: ContactDetails = {
      id:      contactId,
      name:    contactName         || '',
      phoneNo: toE164(contactPhone || ''),
      email:   contactEmail        || '',
    }

    const tax: TaxInfo | null = (taxRate != null && taxRate > 0)
      ? { rate: taxRate, city: taxCity ?? '' }
      : null

    const totalStr      = grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    const divisor       = tax ? (1 + tax.rate) : 1
    const preTaxDeposit = Math.round((depositAmount / divisor) * 100) / 100
    const preTaxBalance = Math.round((balanceDue   / divisor) * 100) / 100

    // Fetch location userId (required by the send endpoint)
    const userId = await getGhlLocationUserId(token)

    // Create deposit invoice then immediately send it so it's ready to pay
    const depositInvoice = await createGhlInvoice(
      token,
      `Deposit (${depositPct}%) — ${contactName}`,
      itemLabel,
      `Deposit for project totaling ${totalStr}`,
      preTaxDeposit,
      tax,
      contact,
      company,
      issueDate,
    )
    await sendGhlInvoice(token, depositInvoice.id, userId)

    // Balance invoice stays as draft
    const balanceInvoice = await createGhlInvoice(
      token,
      `Balance Due — ${contactName}`,
      itemLabel,
      `Balance due on completion for project totaling ${totalStr}`,
      preTaxBalance,
      tax,
      contact,
      company,
      issueDate,
    )

    console.log('[ghl/create-invoices] Created & sent deposit:', depositInvoice.id, '| draft balance:', balanceInvoice.id)

    return NextResponse.json({
      success:          true,
      depositInvoice:   { ...depositInvoice },
      balanceInvoice:   { ...balanceInvoice },
      depositInvoiceUrl: depositInvoice.invoiceUrl,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ghl/create-invoices] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
