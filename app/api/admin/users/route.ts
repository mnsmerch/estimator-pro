import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import type { UserRole } from '@/lib/firebase/users'

// ── Helper: verify the caller is an admin ─────────────────────────────────────
async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    const snap    = await adminDb.collection('users').doc(decoded.uid).get()
    if (!snap.exists || snap.data()?.role !== 'admin') return null
    return decoded.uid
  } catch {
    return null
  }
}

// ── GET /api/admin/users — list all users ─────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const snap = await adminDb.collection('users').orderBy('createdAt', 'asc').get()
  const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
  return NextResponse.json({ users })
}

// ── POST /api/admin/users — create a new user ─────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, password, role } = await req.json() as {
    name: string; email: string; password: string; role: UserRole
  }

  if (!name || !email || !password || !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    // Create Firebase Auth account (server-side — does not log out current user)
    const userRecord = await adminAuth.createUser({ email, password, displayName: name })

    // Store role in Firestore
    await adminDb.collection('users').doc(userRecord.uid).set({
      name, email, role,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ uid: userRecord.uid, name, email, role }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/users]', err)
    const message = err instanceof Error ? err.message : 'Failed to create user'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
