/**
 * POST /api/webhook/invoice-paid
 *
 * Called by a GoHighLevel Workflow when an invoice is marked Paid.
 * Matches the invoice ID to an estimate (deposit or balance) across all
 * estimate collections and records the payment + method.
 *
 * The GHL Workflow "Webhook" action should POST a JSON body. This handler
 * accepts several common field-name variants so it is tolerant of however
 * the workflow is mapped. The minimum required field is the invoice id.
 *
 * Recommended GHL workflow mapping (Custom Data on the webhook action):
 *   invoiceId      = {{invoice.id}}
 *   paymentMethod  = {{invoice.paymentMode}}     (check / cash / card / ...)
 *   amountPaid     = {{invoice.amountPaid}}
 *   invoiceStatus  = {{invoice.status}}
 *   invoiceNumber  = {{invoice.invoiceNumber}}
 */

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const COLLECTIONS = ['estimates', 'interiorEstimates', 'cabinetEstimates']

// Pull a value from the body trying multiple possible key paths
function pick(body: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    // support dotted paths like "invoice.id"
    const val = k.split('.').reduce<unknown>((o, part) =>
      (o && typeof o === 'object') ? (o as Record<string, unknown>)[part] : undefined, body)
    if (val != null && val !== '') return String(val)
  }
  return ''
}

// Normalize GHL payment-mode values into friendly labels
function normalizeMethod(raw: string): string {
  const m = raw.toLowerCase().trim()
  if (!m) return 'Unknown'
  if (m.includes('check') || m.includes('cheque')) return 'Check'
  if (m.includes('cash'))                          return 'Cash'
  if (m.includes('card') || m.includes('credit') || m.includes('stripe')) return 'Credit Card'
  if (m.includes('bank') || m.includes('ach') || m.includes('transfer'))  return 'Bank Transfer'
  if (m.includes('venmo'))  return 'Venmo'
  if (m.includes('paypal')) return 'PayPal'
  if (m.includes('zelle'))  return 'Zelle'
  // Title-case whatever came in
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>

    // Log the raw payload so the GHL field mapping can be verified
    console.log('[invoice-paid] payload:', JSON.stringify(body))

    const invoiceId = pick(body, ['invoiceId', 'invoice_id', 'invoice.id', 'invoice._id', '_id', 'id'])
    if (!invoiceId) {
      return NextResponse.json({ error: 'No invoice id in payload', received: body }, { status: 400 })
    }

    const status = pick(body, ['invoiceStatus', 'status', 'invoice.status']).toLowerCase()
    // Only act on paid events (some workflows fire on multiple statuses)
    if (status && !['paid', 'partially_paid', 'partiallypaid'].includes(status)) {
      return NextResponse.json({ success: true, ignored: true, reason: `status=${status}` })
    }

    const rawMethod = pick(body, ['paymentMethod', 'payment_method', 'paymentMode', 'invoice.paymentMode', 'mode'])
    const method    = normalizeMethod(rawMethod)
    const amountStr = pick(body, ['amountPaid', 'amount_paid', 'amount', 'invoice.amountPaid', 'total'])
    const amount    = amountStr ? parseFloat(amountStr.replace(/[^0-9.]/g, '')) : undefined
    const paidAt    = new Date().toISOString()

    // Find the estimate by matching the invoice id against deposit or balance fields
    for (const col of COLLECTIONS) {
      // Deposit match
      const depSnap = await adminDb.collection(col).where('depositInvoiceId', '==', invoiceId).limit(1).get()
      if (!depSnap.empty) {
        const doc = depSnap.docs[0]
        await doc.ref.update({
          depositPaid:       true,
          depositPaidMethod: method,
          ...(amount != null && !isNaN(amount) ? { depositPaidAmount: amount } : {}),
          depositPaidAt:     paidAt,
          updatedAt:         FieldValue.serverTimestamp(),
        })
        console.log('[invoice-paid] Deposit paid:', col, doc.id, method)
        return NextResponse.json({ success: true, matched: 'deposit', estimateId: doc.id, method })
      }

      // Balance match
      const balSnap = await adminDb.collection(col).where('balanceInvoiceId', '==', invoiceId).limit(1).get()
      if (!balSnap.empty) {
        const doc = balSnap.docs[0]
        await doc.ref.update({
          balancePaid:       true,
          balancePaidMethod: method,
          ...(amount != null && !isNaN(amount) ? { balancePaidAmount: amount } : {}),
          balancePaidAt:     paidAt,
          updatedAt:         FieldValue.serverTimestamp(),
        })
        console.log('[invoice-paid] Balance paid:', col, doc.id, method)
        return NextResponse.json({ success: true, matched: 'balance', estimateId: doc.id, method })
      }
    }

    // No estimate matched — still 200 so GHL does not keep retrying, but flag it
    console.warn('[invoice-paid] No estimate matched invoice id:', invoiceId)
    return NextResponse.json({ success: true, matched: 'none', invoiceId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[invoice-paid] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
