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

    // Strip identity / signature fields; keep all estimate content
    const { createdAt: _ca, updatedAt: _ua, signatureName: _sn, signatureDate: _sd, signatureDataUrl: _sdu, userId: _uid, ...rest } = snap.data() as Record<string, unknown>

    // Firestore rejects undefined values
    const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))

    const newRef = await adminDb.collection(collection).add({
      ...clean,
      userId,
      clientName:       newClientName,
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
