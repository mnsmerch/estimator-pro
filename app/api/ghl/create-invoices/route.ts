import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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
  const data = snap.data()!
  return data.access_token as string
}

// ── GHL Invoice helper ────────────────────────────────────────────────────────

const LOCATION_ID = 'KmTuAFWyGn4ijrs1sIzJ'

interface InvoiceItem {
  name: string
  description?: string
  currency: string
  amount: number
  qty: number
}

interface ContactDetails {
  id: string
  name: string
  phoneNo: string
  email: string
}

interface CompanyDetails {
  name: string
  phone: string
  email: string
  website: string
  streetAddress: string
  cityStateZip: string
}

async function createGhlInvoice(
  token: string,
  invoiceName: string,
  items: InvoiceItem[],
  contact: ContactDetails,
  company: CompanyDetails,
  issueDate: string,
): Promise<{ id: string; invoiceNumber: string }> {
  const body = {
    altId:   LOCATION_ID,
    altType: 'location',
    name:    invoiceName,
    title:   'INVOICE',
    currency: 'USD',
    liveMode: true,
    issueDate,

    businessDetails: {
      name:    company.name,
      phoneNo: company.phone,
      website: company.website,
      address: {
        addressLine1: company.streetAddress,
        city: company.cityStateZip,
      },
    },

    contactDetails: {
      id:      contact.id,
      name:    contact.name,
      phoneNo: contact.phoneNo || '',
      email:   contact.email || '',
    },

    items,

    discount: {
      value: 0,
      type:  'percentage',
    },

    termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',

    // Send to contact email — invoice is still created as draft
    sentTo: {
      email:   contact.email ? [contact.email] : [],
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

  if (!res.ok) {
    throw new Error(`GHL invoice error ${res.status}: ${text}`)
  }

  const json = JSON.parse(text) as Record<string, unknown>
  // GHL returns the invoice at the top level (not nested under 'invoice')
  const inv = (json.invoice ?? json) as Record<string, unknown>
  return {
    id:            (inv._id ?? inv.id ?? '') as string,
    invoiceNumber: (inv.invoiceNumber ?? '') as string,
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
      company,
    } = await req.json() as {
      contactId:     string
      contactName:   string
      contactEmail:  string
      contactPhone:  string
      depositAmount: number
      balanceDue:    number
      depositPercent: number
      company:       CompanyDetails
    }

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
    }

    const token = await getGhlLocationToken()
    const issueDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const contact: ContactDetails = {
      id:      contactId,
      name:    contactName   || '',
      phoneNo: contactPhone  || '',
      email:   contactEmail  || '',
    }

    const depositPct = Math.round((depositPercent ?? 0.2) * 100)

    // Create deposit invoice
    const depositInvoice = await createGhlInvoice(
      token,
      `Deposit (${depositPct}%) — ${contactName}`,
      [{
        name:        `Project Deposit (${depositPct}%)`,
        description: `${depositPct}% deposit required to secure your project start date`,
        currency:    'USD',
        amount:      Math.round(depositAmount * 100) / 100,
        qty:         1,
      }],
      contact,
      company,
      issueDate,
    )

    // Create balance invoice
    const balanceInvoice = await createGhlInvoice(
      token,
      `Balance Due — ${contactName}`,
      [{
        name:        'Remaining Balance',
        description: 'Balance due upon completion of the project',
        currency:    'USD',
        amount:      Math.round(balanceDue * 100) / 100,
        qty:         1,
      }],
      contact,
      company,
      issueDate,
    )

    console.log('[ghl/create-invoices] Created:', depositInvoice.id, balanceInvoice.id)

    return NextResponse.json({
      success:         true,
      depositInvoice,
      balanceInvoice,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ghl/create-invoices] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
