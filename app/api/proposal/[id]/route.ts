import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
  DEFAULT_COMPANY,
} from '@/lib/defaultSettings'
import {
  calcEstimate,
  calcMarkup,
  calcStructureAddonSubtotal,
} from '@/lib/estimateEngine'
import { buildApplicationList } from '@/lib/applicationList'
import type { BusinessRules, ProductionConstants, PaintProduct, ProductionRates } from '@/types/settings'
import type { EstimateData } from '@/types/estimate'
import { FieldValue } from 'firebase-admin/firestore'

const PAINT_BRANDS = [
  { key: 'superPaint', bodyId: 'sw-super-paint-flat', trimId: 'sw-super-paint-satin', accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'duration',   bodyId: 'sw-duration-flat',    trimId: 'sw-duration-satin',    accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'emerald',    bodyId: 'sw-emerald-flat',      trimId: 'sw-emerald-satin',     accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'emeraldRR',  bodyId: 'sw-emerald-rr-flat',   trimId: 'sw-emerald-rr-satin',  accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
]
const emptyPaint: PaintProduct = { id: '', name: '', singleGallon: 0, fiveGallon: 0, coverage: 400 }

function computeGrandTotal(
  estimate: EstimateData,
  rules: BusinessRules,
  constants: ProductionConstants,
  paintProducts: PaintProduct[],
  rates: ProductionRates,
): number {
  try {
    const applications = buildApplicationList(rates)
    const appMap = new Map(applications.map(a => [a.uniqueKey, a]))
    const markup = calcMarkup(rules)
    const brand = PAINT_BRANDS.find(b => b.key === (estimate.selectedBrand ?? 'superPaint')) ?? PAINT_BRANDS[0]
    // When the client supplies paint ('no-paint'), use the stored selections
    const cpp = estimate.selectedBodyPaint === 'no-paint'
    const bodyPaint   = paintProducts.find(p => p.id === (cpp ? (estimate.selectedBodyPaint   ?? brand.bodyId)   : brand.bodyId))   ?? emptyPaint
    const trimPaint   = paintProducts.find(p => p.id === (cpp ? (estimate.selectedTrimPaint   ?? brand.trimId)   : brand.trimId))   ?? emptyPaint
    const accentPaint = paintProducts.find(p => p.id === (cpp ? (estimate.selectedAccentPaint ?? brand.accentId) : brand.accentId)) ?? emptyPaint
    const stainPaint  = paintProducts.find(p => p.id === (cpp ? (estimate.selectedStainPaint  ?? brand.stainId)  : brand.stainId))  ?? emptyPaint

    const jobType = estimate.jobType ?? 'exterior'

    // Exterior painting subtotal
    const validRows = (estimate.rows ?? []).filter(r => r.applicationKey !== '')
    const totals = validRows.length > 0
      ? calcEstimate(validRows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint)
      : null
    const paintingSubtotal = jobType !== 'structures' ? (totals?.subtotal ?? 0) : 0

    // Structure add-ons
    const deckAddons = estimate.deckAddons?.length ? estimate.deckAddons : estimate.deckAddon ? [estimate.deckAddon] : []
    const deckSubtotal    = deckAddons.reduce((s, a) => s + calcStructureAddonSubtotal(a, 1/20, appMap, rules, constants, paintProducts), 0)
    const pergolaSubtotal = estimate.pergolaAddon ? calcStructureAddonSubtotal(estimate.pergolaAddon, 0, appMap, rules, constants, paintProducts) : 0
    const fenceSubtotal   = estimate.fenceAddon   ? calcStructureAddonSubtotal(estimate.fenceAddon,   0, appMap, rules, constants, paintProducts) : 0
    const shedSubtotal    = estimate.shedAddon    ? calcStructureAddonSubtotal(estimate.shedAddon,    0, appMap, rules, constants, paintProducts) : 0
    const structTotal = jobType !== 'exterior' ? (deckSubtotal + pergolaSubtotal + fenceSubtotal + shedSubtotal) : 0

    // Wood replacement
    let woodTotal = 0
    if ((estimate.woodReplacementOpen ?? false) && markup > 0) {
      woodTotal = (estimate.woodReplacementRows ?? []).reduce((sum, row) => {
        if (!row.itemKey) return sum
        const rate = ((rates.woodReplacement ?? {}) as Record<string, number>)[row.itemKey] ?? 0
        const total = row.front + row.right + row.back + row.left
        return sum + (total * rate / markup)
      }, 0)
    }

    // Custom items
    const customTotal = (estimate.customItemsOpen ?? false)
      ? (estimate.customItems ?? []).reduce((sum, i) => (!i.description && !i.price) ? sum : sum + (i.price || 0), 0)
      : 0

    const combinedSubtotal = paintingSubtotal + structTotal + woodTotal + customTotal
    const salesDiscount = rules.salesDiscount ?? 0.10
    const discounted = combinedSubtotal * (1 - salesDiscount)
    const taxRate = estimate.salesTaxRate ?? null
    const taxAmount = taxRate != null ? discounted * taxRate : 0
    return discounted + taxAmount
  } catch {
    return 0
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [estimateSnap, rulesSnap, constantsSnap, paintSnap, ratesSnap, companySnap] =
      await Promise.all([
        adminDb.collection('estimates').doc(id).get(),
        adminDb.collection('settings').doc('businessRules').get(),
        adminDb.collection('settings').doc('productionConstants').get(),
        adminDb.collection('settings').doc('paintProducts').get(),
        adminDb.collection('settings').doc('rates').get(),
        adminDb.collection('settings').doc('company').get(),
      ])

    if (!estimateSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const estimate = { id: estimateSnap.id, ...estimateSnap.data() } as EstimateData

    // Live settings (fallback / for estimates without a frozen snapshot)
    const liveRules         = rulesSnap.exists    ? { ...DEFAULT_BUSINESS_RULES,       ...rulesSnap.data()    } as BusinessRules       : DEFAULT_BUSINESS_RULES
    const liveConstants     = constantsSnap.exists ? { ...DEFAULT_PRODUCTION_CONSTANTS, ...constantsSnap.data() } as ProductionConstants : DEFAULT_PRODUCTION_CONSTANTS
    const livePaintProducts = paintSnap.exists    ? (paintSnap.data()?.items ?? DEFAULT_PAINT_PRODUCTS) as PaintProduct[]              : DEFAULT_PAINT_PRODUCTS
    const liveRates         = ratesSnap.exists    ? { ...DEFAULT_RATES,                 ...ratesSnap.data()    } as ProductionRates      : DEFAULT_RATES

    // FROZEN PRICING: if this estimate captured a snapshot at quote time, use it
    // so the customer's quoted/signed price never drifts when settings are edited.
    const snap = (estimate as EstimateData & { pricingSnapshot?: { rules?: unknown; constants?: unknown; rates?: unknown; paintProducts?: unknown } }).pricingSnapshot
    const rules         = (snap?.rules         as BusinessRules)       ?? liveRules
    const constants     = (snap?.constants     as ProductionConstants) ?? liveConstants
    const paintProducts = (snap?.paintProducts as PaintProduct[])      ?? livePaintProducts
    const rates         = (snap?.rates         as ProductionRates)     ?? liveRates

    // Compute and cache grand total for list view (non-blocking)
    let cachedGrandTotal: number | undefined
    if (estimate.status !== 'approved') {
      const computed = computeGrandTotal(estimate, rules, constants, paintProducts, rates)
      if (computed > 0) {
        cachedGrandTotal = computed
        adminDb.collection('estimates').doc(id).update({
          cachedGrandTotal: computed,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      estimate,
      rules,
      constants,
      paintProducts,
      rates,
      company:          companySnap.exists ? { ...DEFAULT_COMPANY, ...companySnap.data() } : DEFAULT_COMPANY,
      cachedGrandTotal,
    })
  } catch (err) {
    console.error('proposal API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
