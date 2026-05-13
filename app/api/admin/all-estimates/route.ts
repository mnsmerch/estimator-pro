import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  try {
    const token = authHeader.slice(7)
    const decoded = await adminAuth.verifyIdToken(token)
    const snap = await adminDb.collection('users').doc(decoded.uid).get()
    return snap.exists && snap.data()?.role === 'admin'
  } catch {
    return false
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeDoc(data: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

export async function GET(req: Request) {
  if (!await isAdmin(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [extSnap, intSnap, cabSnap] = await Promise.all([
      adminDb.collection('estimates').orderBy('createdAt', 'desc').get(),
      adminDb.collection('interiorEstimates').orderBy('createdAt', 'desc').get(),
      adminDb.collection('cabinetEstimates').orderBy('createdAt', 'desc').get(),
    ])

    const exterior = extSnap.docs.map(d => ({ id: d.id, ...serializeDoc(d.data()), kind: 'exterior' }))
    const interior = intSnap.docs.map(d => ({ id: d.id, ...serializeDoc(d.data()), kind: 'interior' }))
    const cabinet  = cabSnap.docs.map(d => ({ id: d.id, ...serializeDoc(d.data()), kind: 'cabinet'  }))

    return NextResponse.json({ exterior, interior, cabinet })
  } catch (err) {
    console.error('all-estimates error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
