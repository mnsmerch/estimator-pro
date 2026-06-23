import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const COLLECTIONS: Record<string, string> = {
  exterior: 'estimates',
  interior: 'interiorEstimates',
  cabinet:  'cabinetEstimates',
}

export async function POST(req: Request) {
  try {
    const { estimateId, estimateType, grandTotal } = await req.json() as {
      estimateId:    string
      estimateType?: string
      grandTotal:    number
    }
    if (!estimateId || !(grandTotal > 0)) {
      return NextResponse.json({ ok: true })
    }
    const collection = COLLECTIONS[estimateType ?? 'exterior'] ?? 'estimates'
    await adminDb.collection(collection).doc(estimateId).update({
      cachedGrandTotal: grandTotal,
      updatedAt:        FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
