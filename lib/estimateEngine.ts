import type { ApplicationItem } from './applicationList'
import type { BusinessRules, ProductionConstants, PaintProduct } from '@/types/settings'
import type { EstimateRow } from '@/types/estimate'

export interface RowResult {
  rowId: string
  applicationKey: string
  total: number
  hours: number
  // Surface area (SqFt) contribution to each paint type
  bodySqft: number
  trimSqft: number
  accentSqft: number
  stainSqft: number
}

export interface PaintBreakdown {
  gallons: number
  cost: number
}

export interface EstimateTotals {
  rows: RowResult[]
  prepHours: number
  productionHours: number
  cleanupHours: number
  totalHours: number
  laborCost: number
  body: PaintBreakdown
  trim: PaintBreakdown
  accent: PaintBreakdown
  stain: PaintBreakdown
  totalPaintCost: number
  sundries: number
  landm: number
  markup: number
  subtotal: number
  tenPercentOff: number
}

// ─── Markup ───────────────────────────────────────────────────────────────────

export function calcMarkup(rules: BusinessRules): number {
  return (
    1 -
    rules.netProfitMargin -
    rules.overheadMargin -
    rules.marketingMargin -
    rules.salesMargin -
    rules.productionMgmtMargin -
    rules.additionalMargin1 -
    rules.additionalMargin2 -
    rules.additionalMargin3 -
    rules.additionalMargin4 -
    rules.additionalMargin5
  )
}

// ─── Paint cost (bulk-buy formula) ────────────────────────────────────────────

export function calcPaintCost(gallons: number, product: PaintProduct): number {
  if (gallons <= 0) return 0
  // Always round up to whole gallons — you can't buy a fraction of a gallon
  const wholeGallons = Math.ceil(gallons)
  const buckets5 = Math.floor(wholeGallons / 5)
  const remainder = wholeGallons % 5
  // fiveGallon is the per-gallon price in a 5-gallon container, so one bucket = 5 × fiveGallon
  // Matches Google Sheet: ROUNDDOWN(gallons/5)*5*fiveGalPrice + MOD(gallons,5)*singleGalPrice
  return buckets5 * 5 * product.fiveGallon + remainder * product.singleGallon
}

// ─── Surface area factor ───────────────────────────────────────────────────────
// Converts the measurement unit (LnFt / Units) into SqFt for paint gallon calc.
// Body Application items are already in SqFt so factor = 1.

function surfaceAreaFactor(app: ApplicationItem, constants: ProductionConstants): number {
  switch (app.categoryKey) {
    case 'bodyApplication':
      return 1
    case 'eaves':
      return constants.eavesWidthIn / 12
    case 'fascia':
      return constants.fasciaWidthIn / 12
    case 'otherTrim':
      if (app.isDownspout) return constants.downspoutWidthIn / 12
      return constants.otherTrimWidthIn / 12
    case 'windows':
      return app.trimLnFt * (constants.windowTrimWidthIn / 12)
    case 'doors':
    case 'sidelights':
      return app.trimLnFt * (constants.otherTrimWidthIn / 12)
    case 'garageDoors':
      return app.trimLnFt * (constants.otherTrimWidthIn / 12)
    case 'railings':
      return constants.railingsTrimRatio / 100  // ratio stored as e.g. 26 → 0.26 sqft/lnft
    case 'shutters':
      return constants.shutterSqft  // sqft per shutter unit
    case 'staining':
      return app.surfaceAreaFactor || 1
    default:
      return 0  // prepWork, woodReplacement — no paint contribution
  }
}

// ─── Determine which paint bucket a row feeds ──────────────────────────────────

type PaintBucket = 'body' | 'trim' | 'accent' | 'stain' | null

function paintBucket(app: ApplicationItem): PaintBucket {
  if (app.categoryKey === 'staining') return 'stain'
  if (app.isAccent) return 'accent'
  if (app.isTrimColor) return 'trim'
  // isBodyColor rows outside bodyApplication (eaves, doors, garage doors, etc.) contribute 0 paint —
  // those surfaces are covered during the siding spray pass
  if (app.isBodyColor) return null
  if (app.categoryKey === 'bodyApplication') return 'body'
  // Unflagged trim-type categories → trim paint
  if (['eaves', 'fascia', 'otherTrim', 'windows', 'doors', 'sidelights',
       'garageDoors', 'railings', 'shutters'].includes(app.categoryKey)) return 'trim'
  return null  // prepWork, woodReplacement
}

// ─── Per-row calculation ───────────────────────────────────────────────────────

export function calcRow(
  row: EstimateRow,
  app: ApplicationItem,
  constants: ProductionConstants,
): RowResult {
  const total = row.front + row.right + row.back + row.left
  const hours = total * app.converter

  let bodySqft = 0, trimSqft = 0, accentSqft = 0, stainSqft = 0

  // Doors and sidelights with a trim frame need a face/frame paint split.
  // faceLnFt (from static APP_META) = door/sidelight face lnFt → takes the item's color.
  // Remainder (trimLnFt − faceLnFt) = trim frame lnFt → always trim color.
  // When faceLnFt === trimLnFt there is no frame, so we fall through to single-bucket logic.
  const hasFaceFrameSplit =
    (app.categoryKey === 'doors' || app.categoryKey === 'sidelights') &&
    app.faceLnFt !== undefined &&
    app.trimLnFt > app.faceLnFt

  if (hasFaceFrameSplit) {
    const widthFactor = constants.otherTrimWidthIn / 12
    const faceSqft  = total * (app.faceLnFt as number) * widthFactor
    const frameSqft = total * (app.trimLnFt - (app.faceLnFt as number)) * widthFactor
    // Frame always takes trim color
    trimSqft = frameSqft
    // Face takes the door's designated color
    if (app.isAccent)          accentSqft = faceSqft
    else if (!app.isBodyColor) trimSqft  += faceSqft  // isTrimColor or stainedToPainted
    // isBodyColor face → body spray covers it, contributes 0 paint
  } else {
    const sqft   = total * surfaceAreaFactor(app, constants)
    const bucket = paintBucket(app)
    bodySqft   = bucket === 'body'   ? sqft : 0
    trimSqft   = bucket === 'trim'   ? sqft : 0
    accentSqft = bucket === 'accent' ? sqft : 0
    stainSqft  = bucket === 'stain'  ? sqft : 0
  }

  return {
    rowId: row.id,
    applicationKey: row.applicationKey,
    total,
    hours,
    bodySqft,
    trimSqft,
    accentSqft,
    stainSqft,
  }
}

// ─── Full estimate calculation ─────────────────────────────────────────────────

export function calcEstimate(
  rows: EstimateRow[],
  appMap: Map<string, ApplicationItem>,
  rules: BusinessRules,
  constants: ProductionConstants,
  bodyPaint: PaintProduct,
  trimPaint: PaintProduct,
  accentPaint: PaintProduct,
  stainPaint: PaintProduct,
): EstimateTotals {
  // Per-row results — appMap is keyed by uniqueKey (categoryKey.key)
  const rowResults: RowResult[] = rows.map(row => {
    const app = appMap.get(row.applicationKey)
    if (!app) {
      return {
        rowId: row.id, applicationKey: row.applicationKey,
        total: 0, hours: 0,
        bodySqft: 0, trimSqft: 0, accentSqft: 0, stainSqft: 0,
      }
    }
    return calcRow(row, app, constants)
  })

  // Hours
  const prepHours = rowResults
    .filter(r => appMap.get(r.applicationKey)?.categoryKey === 'prepWork')
    .reduce((s, r) => s + r.hours, 0)

  const productionHours = rowResults.reduce((s, r) => s + r.hours, 0)
  const cleanupHours = productionHours / constants.cleanupHoursRatio
  const totalHours = productionHours + cleanupHours

  // Labor
  // Labor = totalHours * wage * payrollBurden  (payrollBurden=1 means no burden)
  // Matches Google Sheet: H48 * (Inputs!B10 * Inputs!B11)
  const hourlyRate = rules.wage * rules.payrollBurden
  const laborCost = totalHours * hourlyRate

  // Paint gallons per type
  // gallons = totalSqft * coverageMultiplier / paintCoverage
  // We use paintCoverageBrushRoll as default multiplier (conservative)
  const totalBodySqft   = rowResults.reduce((s, r) => s + r.bodySqft, 0)
  const totalTrimSqft   = rowResults.reduce((s, r) => s + r.trimSqft, 0)
  const totalAccentSqft = rowResults.reduce((s, r) => s + r.accentSqft, 0)
  const totalStainSqft  = rowResults.reduce((s, r) => s + r.stainSqft, 0)

  // Body is sprayed (higher multiplier); trim/accent are brush/roll
  const bodyGallonsRaw = bodyPaint.coverage > 0 ? (totalBodySqft * constants.paintCoverageSpray) / bodyPaint.coverage : 0

  // Body reduction: accent door/sidelight faces displace body spray paint.
  // GS column L for door rows = −M (body reduction = accent contribution, same rate).
  // Matches: doorFaceSqft × paintCoverageBrushRoll / accentPaint.coverage
  const doorSidelightAccentSqft = rowResults
    .filter(r => {
      const cat = appMap.get(r.applicationKey)?.categoryKey
      return cat === 'doors' || cat === 'sidelights'
    })
    .reduce((s, r) => s + r.accentSqft, 0)
  const bodyReduction = accentPaint.coverage > 0
    ? (doorSidelightAccentSqft * constants.paintCoverageBrushRoll) / accentPaint.coverage
    : 0
  const bodyGallons   = Math.max(0, bodyGallonsRaw - bodyReduction)
  const trimGallons   = trimPaint.coverage > 0   ? (totalTrimSqft   * constants.paintCoverageBrushRoll) / trimPaint.coverage   : 0
  const accentGallons = accentPaint.coverage > 0 ? (totalAccentSqft * constants.paintCoverageBrushRoll) / accentPaint.coverage : 0
  const stainGallons  = stainPaint.coverage > 0  ? (totalStainSqft  * constants.stainCoverage)          / stainPaint.coverage  : 0

  const body:   PaintBreakdown = { gallons: bodyGallons,   cost: calcPaintCost(bodyGallons,   bodyPaint)   }
  const trim:   PaintBreakdown = { gallons: trimGallons,   cost: calcPaintCost(trimGallons,   trimPaint)   }
  const accent: PaintBreakdown = { gallons: accentGallons, cost: calcPaintCost(accentGallons, accentPaint) }
  const stain:  PaintBreakdown = { gallons: stainGallons,  cost: calcPaintCost(stainGallons,  stainPaint)  }

  const totalPaintCost = body.cost + trim.cost + accent.cost + stain.cost

  // Sundries, L&M, pricing
  const sundries   = totalHours * constants.sundriesPerHour
  const landm      = laborCost + totalPaintCost + sundries
  const markup = calcMarkup(rules)
  // Matches Google Sheet: IFERROR(IF(B29=0, ROUND((H52/B23)/(1-B26),0), (H52/B23)/(1-B26)))
  // When salesTax=0 round to nearest dollar; otherwise keep raw for tax calc
  const rawSubtotal   = markup > 0 ? (landm / markup) / (1 - rules.salesDiscount) : 0
  const subtotal      = rules.salesTax === 0 ? Math.round(rawSubtotal) : rawSubtotal
  const tenPercentOff = subtotal * 0.90

  return {
    rows: rowResults,
    prepHours,
    productionHours,
    cleanupHours,
    totalHours,
    laborCost,
    body,
    trim,
    accent,
    stain,
    totalPaintCost,
    sundries,
    landm,
    markup,
    subtotal,
    tenPercentOff,
  }
}
