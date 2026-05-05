import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

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

// ── PATCH /api/admin/users/[uid] — update role ────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const callerId = await requireAdmin(req)
  if (!callerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { uid } = await params
  const { role } = await req.json()

  if (!['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Prevent admin from demoting themselves
  if (uid === callerId && role !== 'admin') {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  try {
    await adminDb.collection('users').doc(uid).update({ role })
    return NextResponse.json({ uid, role })
  } catch (err) {
    console.error('[PATCH /api/admin/users]', err)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}

// ── DELETE /api/admin/users/[uid] — remove a user ────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const callerId = await requireAdmin(req)
  if (!callerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { uid } = await params

  if (uid === callerId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  try {
    await adminAuth.deleteUser(uid)
    await adminDb.collection('users').doc(uid).delete()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/admin/users]', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
