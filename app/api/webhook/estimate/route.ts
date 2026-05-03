import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function getAdminDb() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const existing = getApps().find(a => a.name === '[DEFAULT]')
  if (!existing) {
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  return getFirestore()
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth: verify secret token ─────────────────────────────────────────
    const secret = process.env.WEBHOOK_SECRET?.trim()
    if (secret) {
      const authHeader = (req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace('Bearer ', ''))?.trim()
      if (authHeader !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await req.json()

    // ── Parse fields (flexible — accepts various GHL field name formats) ──
    const clientName      = body.full_name      ?? body.fullName      ?? body.name          ?? `${body.first_name ?? body.firstName ?? ''} ${body.last_name ?? body.lastName ?? ''}`.trim()
    const address1        = body.address1        ?? body.address       ?? body.street        ?? ''
    const city            = body.city            ?? ''
    const state           = body.state           ?? ''
    const zip             = body.postal_code     ?? body.postalCode    ?? body.zip           ?? ''
    const clientPhone     = body.phone           ?? body.phone_number  ?? body.phoneNumber   ?? ''
    const clientEmail     = body.email           ?? ''
    const rawFolderId     = body.folder_id       ?? body.folderId      ?? body.clientFolderId ?? ''
    // Extract folder ID from full Drive URL if needed
    const clientFolderId  = typeof rawFolderId === 'string' && rawFolderId.includes('drive.google.com')
      ? (rawFolderId.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? rawFolderId)
      : rawFolderId
    const clientContactId = body.contact_id      ?? body.contactId     ?? body.id            ?? ''

    // Build full address string
    const parts = [address1, city, state, zip].filter(Boolean)
    const clientAddress = parts.length >= 3
      ? `${address1}, ${city}, ${state} ${zip}`.trim()
      : parts.join(', ')

    if (!clientName) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
    }

    // ── Create draft estimate in Firestore ────────────────────────────────
    const db = getAdminDb()

    const docRef = await db.collection('estimates').add({
      userId:           'webhook',
      status:           'draft',
      clientName,
      clientAddress,
      clientPhone,
      clientEmail,
      clientFolderId,
      clientContactId,
      rows:             [],
      woodReplacementRows: [],
      woodReplacementOpen: false,
      customItems:      [],
      customItemsOpen:  false,
      selectedBrand:    'superPaint',
      photoUrls:        [],
      createdAt:        FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    })

    console.log('[webhook/estimate] Created draft:', docRef.id, 'for', clientName)

    return NextResponse.json({
      success: true,
      estimateId: docRef.id,
      editUrl: `https://estimator-pro-orcin.vercel.app/estimates/${docRef.id}/edit`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhook/estimate] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
