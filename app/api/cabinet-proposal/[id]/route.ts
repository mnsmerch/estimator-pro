import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'
import { calculateCabinet, sumCabinetCustomItems } from '@/types/cabinetEstimate'
import type { CabinetEstimateDraft, CabinetCustomItem } from '@/types/cabinetEstimate'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [estimateSnap, companySnap] = await Promise.all([
      adminDb.collection('cabinetEstimates').doc(id).get(),
      adminDb.collection('settings').doc('company').get(),
    ])

    if (!estimateSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const estimate = { id: estimateSnap.id, ...estimateSnap.data() }

    // Compute and cache grand total for list view
    let cachedGrandTotal: number | undefined
    if ((estimate as Record<string, unknown>).status !== 'approved') {
      try {
        const raw = estimate as Record<string, unknown>
        // Guard against Firestore nulls
        const safeDraft = {
          ...raw,
          largePanels: Array.isArray(raw.largePanels) ? raw.largePanels : [],
          doors:       raw.doors   ?? 0,
          drawers:     raw.drawers ?? 0,
          panelsDoorSize: raw.panelsDoorSize ?? 0,
          twoTone:     raw.twoTone    ?? false,
          patchHoles:  raw.patchHoles ?? false,
          aquaCoat:    raw.aquaCoat   ?? false,
        } as unknown as CabinetEstimateDraft
        const bd = calculateCabinet(safeDraft)
        const customTotal = sumCabinetCustomItems(raw.customItems as CabinetCustomItem[] | undefined)
        const override = (typeof raw.subtotalOverride === 'number' && raw.subtotalOverride > 0) ? raw.subtotalOverride : null
        const subtotal = override ?? ((bd.total ?? 0) + customTotal)
        if (subtotal > 0) {
          const taxRate    = raw.salesTaxRate as number | null ?? null
          const discountPct = (raw.discountPercent as number | null | undefined) ?? 0.10
          const discounted = subtotal * (1 - discountPct)
          const taxAmount  = taxRate != null ? discounted * taxRate : 0
          cachedGrandTotal = discounted + taxAmount
          adminDb.collection('cabinetEstimates').doc(id).update({
            cachedGrandTotal,
            updatedAt: FieldValue.serverTimestamp(),
          }).catch(() => {})
        }
      } catch (e) { console.error('[cabinet-proposal] compute error:', e) }
    }

    return NextResponse.json({
      estimate,
      company:         companySnap.exists ? { ...DEFAULT_COMPANY, ...companySnap.data() } : DEFAULT_COMPANY,
      cachedGrandTotal,
    })
  } catch (err) {
    console.error('cabinet-proposal API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
