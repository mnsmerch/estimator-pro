import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { CABINET_SCOPE_DEFAULTS } from '@/types/cabinetEstimate'

type EType = 'exterior' | 'interior' | 'cabinet'

const COLLECTIONS: Record<EType, string> = {
  exterior: 'estimates',
  interior: 'interiorEstimates',
  cabinet:  'cabinetEstimates',
}

const EDIT_PATH: Record<EType, (id: string) => string> = {
  exterior: id => `/estimates/${id}/edit`,
  interior: id => `/estimates/interior/${id}/edit`,
  cabinet:  id => `/estimates/cabinet/${id}/edit`,
}

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

export async function POST(req: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    const userId  = decoded.uid

    const { estimateId, fromType, toType } = await req.json() as {
      estimateId: string
      fromType:   EType
      toType:     EType
    }

    if (!estimateId || !fromType || !toType) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (fromType === toType) {
      return NextResponse.json({ error: 'Source and target type are the same' }, { status: 400 })
    }
    if (!COLLECTIONS[toType] || !COLLECTIONS[fromType]) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    // ── Load source ───────────────────────────────────────────────────────
    const srcRef  = adminDb.collection(COLLECTIONS[fromType]).doc(estimateId)
    const srcSnap = await srcRef.get()
    if (!srcSnap.exists) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }
    const src = srcSnap.data() as Record<string, unknown>

    // Safety: only draft estimates can be converted
    if ((src.status ?? 'draft') !== 'draft') {
      return NextResponse.json({ error: 'Only draft estimates can be converted' }, { status: 400 })
    }

    // ── Carry over client info (normalize address field name) ─────────────
    const clientName      = (src.clientName      as string) ?? ''
    const address         = (src.clientAddress   as string) ?? (src.address as string) ?? ''
    const clientPhone     = (src.clientPhone     as string) ?? ''
    const clientEmail     = (src.clientEmail     as string) ?? ''
    const clientFolderId  = (src.clientFolderId  as string) ?? ''
    const clientContactId = (src.clientContactId as string) ?? ''
    const photoUrls       = (src.photoUrls as string[]) ?? []
    const photoNotes      = (src.photoNotes as string[]) ?? []
    const estimateNumber  = src.estimateNumber as number | undefined

    const common = {
      userId,
      status:          'draft' as const,
      clientName,
      clientPhone,
      clientEmail,
      clientFolderId,
      clientContactId,
      photoUrls,
      ...(photoNotes.length ? { photoNotes } : {}),
      ...(estimateNumber != null ? { estimateNumber } : {}),
      createdAt:       FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
    }

    let payload: Record<string, unknown>
    if (toType === 'exterior') {
      payload = {
        ...common,
        clientAddress:       address,
        rows:                [],
        woodReplacementRows: [],
        woodReplacementOpen: false,
        customItems:         [],
        customItemsOpen:     false,
        selectedBrand:       'superPaint',
        salesTaxRate:        null,
      }
    } else if (toType === 'interior') {
      payload = {
        ...common,
        address,
        options:      [],
        scope:        INTERIOR_SCOPE_DEFAULTS,
        salesTaxRate: null,
      }
    } else {
      // cabinet
      payload = {
        ...common,
        address,
        doors:          '',
        drawers:        '',
        panelsDoorSize: '',
        largePanels:    [],
        twoTone:        false,
        patchHoles:     false,
        aquaCoat:       false,
        scope:          { ...CABINET_SCOPE_DEFAULTS },
        notes:          '',
        salesTaxRate:   null,
      }
    }

    // ── Create new + delete old ───────────────────────────────────────────
    const newRef = await adminDb.collection(COLLECTIONS[toType]).add(payload)
    await srcRef.delete()

    return NextResponse.json({
      success:    true,
      newId:      newRef.id,
      editUrl:    EDIT_PATH[toType](newRef.id),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[convert-estimate-type]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
