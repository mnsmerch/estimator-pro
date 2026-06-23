import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const GHL_WEBHOOK  = 'https://services.leadconnectorhq.com/invoices/'
const LOCATION_ID  = 'KmTuAFWyGn4ijrs1sIzJ'

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
      selectedBrand,
      preTaxTotal,       // grand total before tax (post-discount)
      taxRate,           // decimal e.g. 0.101
      taxCity,
      depositAlreadyPaid,
      contactId,
      contactName,
      contactEmail,
      contactPhone,
      estimateNumber,
      sendToClient,
      company,
    } = await req.json() as {
      estimateId:         string
      selectedBrand:      string
      preTaxTotal:        number
      taxRate:            number
      taxCity:            string
      depositAlreadyPaid: number
      contactId?:         string
      contactName?:       string
      contactEmail?:      string
      contactPhone?:      string
      estimateNumber?:    number | null
      sendToClient?:      boolean
      company?: {
        name: string; phone: string; email: string
        website: string; streetAddress: string; cityStateZip: string
      }
    }

    const taxAmount        = Math.round(preTaxTotal * taxRate * 100) / 100
    const newGrandTotal    = Math.round((preTaxTotal + taxAmount) * 100) / 100
    const remainingBalance = Math.round((newGrandTotal - depositAlreadyPaid) * 100) / 100

    // 1. Update estimate with corrected brand, tax rate, and pricing
    await adminDb.collection('estimates').doc(estimateId).update({
      selectedBrand,
      salesTaxRate:         taxRate,
      signedTaxRate:        taxRate,
      signedTaxCity:        taxCity,
      signedGrandTotal:     newGrandTotal,
      signedDepositAmount:  depositAlreadyPaid,
      signedBalanceDue:     remainingBalance,
      correctedAt:          FieldValue.serverTimestamp(),
      updatedAt:            FieldValue.serverTimestamp(),
    })

    // 2. Create corrected balance invoice in GHL (if contact info provided)
    let invoiceUrl: string | null = null

    if (contactId && company) {
      try {
        const token      = await getGhlToken()
        const issueDate  = new Date().toISOString().slice(0, 10)
        const totalStr   = newGrandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        const estNumStr  = estimateNumber ? String(estimateNumber) : null

        const divisor    = 1 + taxRate
        const preTaxBal  = Math.round((remainingBalance / divisor) * 100) / 100

        const taxEntry = [{
          _id:         newObjectId(),
          taxId:       newObjectId(),
          name:        taxCity ? `Sales Tax - ${taxCity} ${parseFloat((taxRate * 100).toFixed(4))}%` : `Sales Tax ${parseFloat((taxRate * 100).toFixed(4))}%`,
          rate:        parseFloat((taxRate * 100).toFixed(4)),
          calculation: 'exclusive',
          description: '',
        }]

        const contactDetails = {
          id:      contactId,
          name:    contactName ?? '',
          phoneNo: toE164(contactPhone ?? ''),
          email:   contactEmail ?? '',
        }

        const invoiceBody = {
          altId: LOCATION_ID, altType: 'location',
          name:  estNumStr ? `#${estNumStr} — Corrected Balance Due — ${contactName}` : `Corrected Balance Due — ${contactName}`,
          title: 'INVOICE', currency: 'USD', liveMode: true,
          issueDate,
          ...(estNumStr ? { invoiceNumber: estNumStr } : {}),
          businessDetails: {
            logoUrl: 'https://assets.cdn.filesafe.space/KmTuAFWyGn4ijrs1sIzJ/media/682e521b6595bee932068728.png',
            name: company.name, phoneNo: company.phone, website: company.website,
            address: { addressLine1: company.streetAddress, city: company.cityStateZip },
          },
          contactDetails,
          items: [{
            name:        'Balance Due on Completion',
            description: `Corrected balance for project totaling ${totalStr}. Deposit of ${depositAlreadyPaid.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} already paid.`,
            currency: 'USD',
            amount:   preTaxBal,
            qty:      1,
            type:     'one_time',
            taxes:    taxEntry,
          }],
          discount: { value: 0, type: 'percentage' },
          termsNotes: '<p>A 2% credit card processing fee applies when paying by credit card.</p>',
          sentTo: {
            email:   contactEmail ? [contactEmail] : [],
            phoneNo: contactDetails.phoneNo ? [contactDetails.phoneNo] : [],
          },
        }

        const headers = { Authorization: `Bearer ${token}`, Version: '2023-02-21', 'Content-Type': 'application/json' }
        const res     = await fetch(GHL_WEBHOOK, { method: 'POST', headers, body: JSON.stringify(invoiceBody) })
        const json    = await res.json() as Record<string, unknown>
        const inv     = (json.invoice ?? json) as Record<string, unknown>
        const invId   = (inv._id ?? inv.id ?? '') as string
        invoiceUrl    = (inv.invoiceUrl ?? `https://link.fastpaydirect.com/invoice/${invId}`) as string

        // Send to client only if explicitly requested
        if (sendToClient && invId) {
          await fetch(`${GHL_WEBHOOK}${invId}/send`, {
            method: 'POST', headers,
            body: JSON.stringify({ altId: LOCATION_ID, altType: 'location', action: 'sms_and_email', liveMode: true, sentFrom: { fromName: company.name, fromEmail: company.email } }),
          })
        }

        // Store the new balance invoice ID
        if (invId) {
          await adminDb.collection('estimates').doc(estimateId).update({ balanceInvoiceId: invId })
        }
      } catch (invoiceErr) {
        console.error('[correct-tax-invoice] GHL error:', invoiceErr)
      }
    }

    return NextResponse.json({
      success: true,
      taxAmount,
      newGrandTotal,
      remainingBalance,
      invoiceUrl,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[correct-tax-invoice]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
