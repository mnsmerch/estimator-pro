import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const COLLECTIONS: Record<string, string> = {
  exterior: 'estimates',
  interior: 'interiorEstimates',
  cabinet:  'cabinetEstimates',
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    const userId = decoded.uid

    const { estimateId, estimateType, newClientName } = await req.json() as {
      estimateId:    string
      estimateType:  string
      newClientName: string
    }

    const collection = COLLECTIONS[estimateType] ?? 'estimates'
    const snap = await adminDb.collection(collection).doc(estimateId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    // Strip identity / signature / number / change-order fields — duplicate starts fresh
    const {
      createdAt: _ca, updatedAt: _ua,
      signatureName: _sn, signatureDate: _sd, signatureDataUrl: _sdu,
      signedGrandTotal: _sgt, signedDepositAmount: _sda, signedBalanceDue: _sbl,
      signedDepositPercent: _sdp, signedTaxRate: _str, signedTaxCity: _stc,
      invoiceCreated: _ic, depositInvoiceUrl: _diu, balanceInvoiceId: _bid,
      changeOrders: _co, changeOrderDate: _cod, changeOrderNotes: _con, isModified: _im,
      estimateNumber: _en,
      userId: _uid,
      ...rest
    } = snap.data() as Record<string, unknown>

    // If original had change orders, bake them into customItems so price is already included
    const originalChangeOrders = (snap.data() as Record<string, unknown>).changeOrders as { id: string; description: string; price: number }[] | undefined
    const originalCustomItems  = (rest.customItems as { id: string; description: string; price: number }[] | undefined) ?? []
    if (originalChangeOrders?.length) {
      const changeOrderAsCustom = originalChangeOrders.map(co => ({
        id:          co.id,
        description: `[Change Order] ${co.description}`,
        price:       co.price,
      }))
      rest.customItems = [...originalCustomItems, ...changeOrderAsCustom]
      rest.customItemsOpen = true   // show them in the form
    }

    // Firestore rejects undefined values
    const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))

    // Atomically get the next estimate number
    const counterRef = adminDb.collection('settings').doc('estimateCounter')
    const estimateNumber = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(counterRef)
      const next = snap.exists ? (snap.data()!.value as number) + 1 : 5585
      tx.set(counterRef, { value: next })
      return next
    })

    const newRef = await adminDb.collection(collection).add({
      ...clean,
      userId,
      clientName:       newClientName,
      estimateNumber,
      status:           'draft',
      salesTaxRate:     null,
      signatureName:    '',
      signatureDate:    '',
      signatureDataUrl: '',
      createdAt:        FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ newId: newRef.id })
  } catch (err) {
    console.error('[duplicate-estimate] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
