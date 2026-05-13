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

    const exterior = extSnap.docs.map(d => ({ id: d.id, ...d.data(), kind: 'exterior' }))
    const interior = intSnap.docs.map(d => ({ id: d.id, ...d.data(), kind: 'interior' }))
    const cabinet  = cabSnap.docs.map(d => ({ id: d.id, ...d.data(), kind: 'cabinet'  }))

    return NextResponse.json({ exterior, interior, cabinet })
  } catch (err) {
    console.error('all-estimates error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
