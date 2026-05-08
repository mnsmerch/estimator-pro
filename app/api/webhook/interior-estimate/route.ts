import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const INTERIOR_SCOPE_DEFAULTS = {
  projectDescription:
    '- Paint walls and ceiling for the entire house.\n- Prep & paint all doors, jambs & trim\n- Prep and paint all window trim\n- Prep & paint all baseboards\n- Paint fireplace hearth',
  prepWork:
    'For walls and ceiling:\n• Mask Floors\n• Cover Furniture\n• Caulk All Cracks\n• Refill All Nail Holes\n• Patch repairs & texture large fix\'s\n• Remove Electrical Plates\n• Remove Window Treatments\n\nFor trim:\n• Wipe clean any dirt & grime\n• Light sand.\n• Prime with shellac to ensure proper paint adhesion\n• Fill any nail holes\n• Light sand.\n• Remove dust & debris\n• Caulk any separating joints\n• Apply fine finish Emerald Urethane Enamel\n\nFor doors:\n• Remove Door Hinges\n• Remove Door Handles\n• Create an "Air-Bubble" Spray Booth\n• Sand Doors To Allow For Proper Adhesion\n• Spray shellac based primer\n• Fill any holes & deep scrapes\n• Sand doors\n• Remove dust & debris for a smooth finish\n• Spray 2 coats of Emerald urethane enamel using a Fine-Finish Paint Sprayer\n• Allow Dry Time\n• Re-Install Doors\n• Re-Install Hinges\n• Re-Install Handles\n• Quality Control Door(s) Open & Close Properly',
  finalTouches:
    '• Take off all of the masking.\n• Re-Install Electrical Plates\n• Re-Install Window Treatments.\n• Clean up all work areas\n• Final walk through with home owner\n• Balance due upon completion',
  paintProducts:
    'Walls and ceiling: Sherwin Williams \'\'SuperPaint\'\' interior acrylic latex paint.\nTrim and doors: Sherwin Williams "Emerald Urethane Enamel" Acrylic enamel paint.\nThe price includes the paint, labor and materials',
  totalColors: '',
  totalCoats:  '',
}

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

    // ── Create draft interior estimate in Firestore ───────────────────────
    const db = getAdminDb()

    const docRef = await db.collection('interiorEstimates').add({
      userId:           'webhook',
      status:           'draft',
      clientName,
      address:          clientAddress,
      clientPhone,
      clientEmail,
      clientFolderId,
      clientContactId,
      salesTaxRate:     null,
      options:          [],
      photoUrls:        [],
      scope:            INTERIOR_SCOPE_DEFAULTS,
      createdAt:        FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    })

    console.log('[webhook/interior-estimate] Created draft:', docRef.id, 'for', clientName)

    return NextResponse.json({
      success:    true,
      estimateId: docRef.id,
      editUrl:    `https://estimator-pro-orcin.vercel.app/estimates/interior/${docRef.id}/edit`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhook/interior-estimate] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
