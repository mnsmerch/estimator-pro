import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import {
  DEFAULT_INTERIOR_RULES,
  DEFAULT_INTERIOR_PAINT_PRODUCTS,
  DEFAULT_INTERIOR_RATES,
  DEFAULT_INTERIOR_CONSTANTS,
  DEFAULT_COMPANY,
} from '@/lib/defaultSettings'
import {
  calculatePainterOverview,
  calculateCostBreakdown,
  calculateCombiningSavings,
} from '@/lib/interiorCalculations'
import type { InteriorBusinessRules, InteriorPaintProduct, InteriorProductionRates, InteriorProductionConstants } from '@/types/interiorSettings'
import type { RoomOption } from '@/types/interiorEstimate'
import { FieldValue } from 'firebase-admin/firestore'

function computeInteriorGrandTotal(
  estimate: Record<string, unknown>,
  rules: InteriorBusinessRules,
  products: InteriorPaintProduct[],
  rates: InteriorProductionRates,
  constants: InteriorProductionConstants,
): number {
  try {
    const options = (estimate.options ?? []) as RoomOption[]
    if (!options.length) return 0

    const salesDiscount = rules.salesDiscount ?? 0.10

    // rawSubtotalBeforeSavings for each room
    const rawSums = options.map(o => {
      const po = calculatePainterOverview(o, rates, constants, products, rules)
      const cb = calculateCostBreakdown(po, rules)
      return { option: o, raw: cb.rawSubtotalBeforeSavings, po }
    })
    const totalRaw = rawSums.reduce((s, r) => s + r.raw, 0)

    // Combining savings (only when > 1 room)
    let savings = 0
    if (options.length > 1) {
      savings = calculateCombiningSavings(options, rates, constants, products, rules)
    }

    const selectedTotal = Math.round((totalRaw - savings) / (1 - salesDiscount) * 100) / 100

    // Custom items
    const customItems = (estimate.customItems ?? []) as { price?: number }[]
    const customTotal = customItems.reduce((s, i) => s + (i.price || 0), 0)

    const overrideRaw = estimate.subtotalOverride
    const override = (typeof overrideRaw === 'number' && overrideRaw > 0) ? overrideRaw : null
    const combinedSubtotal = override ?? (selectedTotal + customTotal)
    const discounted = combinedSubtotal - Math.round(combinedSubtotal * 0.10 * 100) / 100
    const taxRate = estimate.salesTaxRate as number | null ?? null
    const taxAmount = taxRate != null ? Math.round(discounted * taxRate * 100) / 100 : 0
    return discounted + taxAmount
  } catch (e) {
    console.error('[interior-proposal] compute error:', e)
    return 0
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [estimateSnap, rulesSnap, paintSnap, ratesSnap, constantsSnap, companySnap] =
      await Promise.all([
        adminDb.collection('interiorEstimates').doc(id).get(),
        adminDb.collection('settings').doc('interiorBusinessRules').get(),
        adminDb.collection('settings').doc('interiorPaintProducts').get(),
        adminDb.collection('settings').doc('interiorRates').get(),
        adminDb.collection('settings').doc('interiorProductionConstants').get(),
        adminDb.collection('settings').doc('company').get(),
      ])

    if (!estimateSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const estimate  = { id: estimateSnap.id, ...estimateSnap.data() } as Record<string, unknown>
    const rules     = rulesSnap.exists     ? { ...DEFAULT_INTERIOR_RULES,     ...rulesSnap.data()     } as InteriorBusinessRules       : DEFAULT_INTERIOR_RULES
    const products  = paintSnap.exists     ? (paintSnap.data()?.items ?? DEFAULT_INTERIOR_PAINT_PRODUCTS) as InteriorPaintProduct[]     : DEFAULT_INTERIOR_PAINT_PRODUCTS
    const rates     = ratesSnap.exists     ? { ...DEFAULT_INTERIOR_RATES,     ...ratesSnap.data()     } as InteriorProductionRates      : DEFAULT_INTERIOR_RATES
    const constants = constantsSnap.exists ? { ...DEFAULT_INTERIOR_CONSTANTS, ...constantsSnap.data() } as InteriorProductionConstants  : DEFAULT_INTERIOR_CONSTANTS

    // Compute and cache grand total for list view
    let cachedGrandTotal: number | undefined
    if (estimate.status !== 'approved') {
      const computed = computeInteriorGrandTotal(estimate, rules, products, rates, constants)
      if (computed > 0) {
        cachedGrandTotal = computed
        adminDb.collection('interiorEstimates').doc(id).update({
          cachedGrandTotal: computed,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      estimate,
      rules,
      products,
      rates,
      constants,
      company:         companySnap.exists ? { ...DEFAULT_COMPANY, ...companySnap.data() } : DEFAULT_COMPANY,
      cachedGrandTotal,
    })
  } catch (err) {
    console.error('interior-proposal API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
