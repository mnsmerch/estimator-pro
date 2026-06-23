import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const COLLECTIONS: Record<string, string> = {
  exterior: 'estimates',
  interior: 'interiorEstimates',
  cabinet:  'cabinetEstimates',
}

/**
 * Recovery endpoint — links GHL invoices that were created out-of-band
 * (e.g. when the original signing flow failed) back to an estimate so
 * future change orders and the proposal page work correctly.
 */
export async function POST(req: Request) {
  try {
    const {
      estimateId,
      estimateType = 'exterior',
      clientContactId,
      depositInvoiceId,
      balanceInvoiceId,
      depositInvoiceUrl,
      clearPayments,
    } = await req.json() as {
      estimateId:         string
      estimateType?:      string
      clientContactId?:   string
      depositInvoiceId?:  string
      balanceInvoiceId?:  string
      depositInvoiceUrl?: string
      clearPayments?:     boolean
    }

    if (!estimateId) {
      return NextResponse.json({ error: 'estimateId is required' }, { status: 400 })
    }

    const collection = COLLECTIONS[estimateType] ?? 'estimates'

    await adminDb.collection(collection).doc(estimateId).update({
      invoiceCreated: true,
      ...(clientContactId   ? { clientContactId }   : {}),
      ...(depositInvoiceId  ? { depositInvoiceId }  : {}),
      ...(balanceInvoiceId  ? { balanceInvoiceId }  : {}),
      ...(depositInvoiceUrl ? { depositInvoiceUrl } : {}),
      ...(clearPayments ? {
        depositPaid:       FieldValue.delete(),
        depositPaidMethod: FieldValue.delete(),
        depositPaidAmount: FieldValue.delete(),
        depositPaidAt:     FieldValue.delete(),
        balancePaid:       FieldValue.delete(),
        balancePaidMethod: FieldValue.delete(),
        balancePaidAmount: FieldValue.delete(),
        balancePaidAt:     FieldValue.delete(),
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/link-invoices]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
