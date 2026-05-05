// ── Interior Estimate Calculations ────────────────────────────────────────────
//
// Mirrors the Google Sheet formulas exactly.
// All functions are pure — no side effects, no Firestore.

import type { RoomOption } from '@/types/interiorEstimate'
import type {
  InteriorProductionRates, InteriorPaintProduct,
  InteriorBusinessRules, InteriorProductionConstants,
} from '@/types/interiorSettings'

// Wall types that count as "same color" (1 coat for gallons)
const SAME_COLOR_WALL_KEYS = new Set([
  'texturedSameColor',
  'smoothSameColor',
])

// Ceiling types that count as "same color" (1 coat for gallons)
const SAME_COLOR_CEILING_KEYS = new Set([
  'texturedSameColor',
  'texturedVaultedSameColor',
  'smoothSameColor',
  'smoothVaultedSameColor',
  'popcornSameColor',
  'popcornVaultedSameColor',
])

export interface WallCalc {
  hours:      number   // total labor hours (2 dp)
  gallons:    number   // gallons needed, rounded up to whole number
  laborCost:  number   // hours × wage × payrollBurden (2 dp)
  price:      number   // (labor + materials) / markup (2 dp)
}

/**
 * Wall hours formula (per section):
 *   (surfaceArea / sqftPerHr) + (length / tapingRate) + (length / handCut)
 *
 * Wall gallons formula:
 *   ceil( sum( (sqft / coverage) × (2 − sameColorMultiplier) ) )
 *   sameColorMultiplier = 1 if wall type is a "same color" type, else 0
 *
 * Wall labor formula:
 *   hours × wage × payrollBurden
 *
 * Wall price formula:
 *   (laborCost + gallons × pricePerGallon) / markup
 *   markup = 1 − (netProfitMargin + overheadMargin + marketingMargin + salesMargin + productionMgmtMargin)
 */
export function calculateWallCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): WallCalc {
  const tapingRate = rates.prepWork.tapeLineCaulking ?? 30

  const product  = paintProducts.find(p => p.id === option.paints.wall)
  const coverage = product?.coverage ?? 400

  let totalHours      = 0
  let totalRawGallons = 0

  for (const section of option.walls) {
    const wallRate = rates.wallTypes[section.wallType]
    if (!wallRate) continue

    let sectionLength = 0
    let sectionSqft   = 0

    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const h = m.height === '' ? 0 : m.height
      sectionLength += l
      sectionSqft   += l * h
    }

    if (sectionSqft === 0 && sectionLength === 0) continue

    // Hours
    totalHours +=
      (sectionSqft   / wallRate.sqftPerHr) +
      (sectionLength / tapingRate) +
      (sectionLength / wallRate.handCut)

    // Gallons — same-color types use 1 coat, change-color / prime use 2 coats
    const coatMultiplier = 2 - (SAME_COLOR_WALL_KEYS.has(section.wallType) ? 1 : 0)
    totalRawGallons += (sectionSqft / coverage) * coatMultiplier
  }

  const hours     = Math.round(totalHours * 100) / 100
  const gallons   = Math.ceil(totalRawGallons)
  const laborCost = Math.round(hours * rules.wage * rules.payrollBurden * 100) / 100

  const markup    = 1 - (
    rules.netProfitMargin +
    rules.overheadMargin +
    rules.marketingMargin +
    rules.salesMargin +
    rules.productionMgmtMargin
  )
  const pricePerGallon = paintProducts.find(p => p.id === option.paints.wall)?.pricePerGallon ?? 0
  const materials = gallons * pricePerGallon
  const price     = markup > 0 ? Math.round((laborCost + materials) / markup * 100) / 100 : 0

  return {
    hours,
    gallons,
    laborCost,
    price,
  }
}

// ── Ceiling Calculations ──────────────────────────────────────────────────────

export interface CeilingCalc {
  hours:     number   // total labor hours (2 dp)
  gallons:   number   // gallons needed, rounded up to whole number
  laborCost: number   // hours × wage × payrollBurden (2 dp)
  price:     number   // (labor + materials) / markup (2 dp)
}

/**
 * Ceiling hours formula (mirrors sheet N14):
 *   (ceilingSqft / sqftPerHr) + (ceilingSqft / maskingFlooringRate)
 *   Term 1: rolling/spraying the ceiling
 *   Term 2: masking the floor under the ceiling (maskingFlooring = 250 sqft/hr)
 *
 * Ceiling gallons:
 *   ceil( sum( (sqft / coverage) × (2 − sameColorMultiplier) ) )
 *
 * Price uses raw (unrounded) labor to match sheet precision.
 */
export function calculateCeilingCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): CeilingCalc {
  const maskingFlooringRate = rates.prepWork.maskingFlooring ?? 250

  const product  = paintProducts.find(p => p.id === option.paints.ceiling)
  const coverage = product?.coverage ?? 400

  let paintCeilingsHours = 0
  let totalCeilingSqft   = 0
  let totalRawGallons    = 0

  for (const section of option.ceilings) {
    const sqftPerHr = rates.ceilingTypes[section.ceilingType]
    if (!sqftPerHr) continue

    let sectionSqft = 0
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const w = m.width  === '' ? 0 : m.width
      sectionSqft += l * w
    }
    if (sectionSqft === 0) continue

    paintCeilingsHours += sectionSqft / sqftPerHr
    totalCeilingSqft   += sectionSqft

    const coatMult = 2 - (SAME_COLOR_CEILING_KEYS.has(section.ceilingType) ? 1 : 0)
    totalRawGallons += (sectionSqft / coverage) * coatMult
  }

  if (paintCeilingsHours === 0) {
    return { hours: 0, gallons: 0, laborCost: 0, price: 0 }
  }

  // Mask floor under ceiling = totalCeilingSqft / maskingFlooringRate
  const maskFloorHours = totalCeilingSqft / maskingFlooringRate

  const totalHours = paintCeilingsHours + maskFloorHours
  const hours      = Math.round(totalHours * 100) / 100
  const gallons    = Math.ceil(totalRawGallons)

  // Use raw (unrounded) labor for price to match sheet precision
  const rawLaborCost = totalHours * rules.wage * rules.payrollBurden
  const laborCost    = Math.round(rawLaborCost * 100) / 100

  const markup = 1 - (
    rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin +
    rules.salesMargin + rules.productionMgmtMargin
  )
  const pricePerGallon = product?.pricePerGallon ?? 0
  const materials = gallons * pricePerGallon
  const price = markup > 0 ? Math.round((rawLaborCost + materials) / markup * 100) / 100 : 0

  return { hours, gallons, laborCost, price }
}

// ── Baseboard Calculations ────────────────────────────────────────────────────

// Baseboard types where 1 coat is sufficient for gallons
const SAME_COLOR_BASEBOARD_KEYS = new Set(['sameColor'])

export interface BaseboardCalc {
  hours:     number   // total labor hours (2 dp)
  gallons:   number   // gallons needed, rounded up
  laborCost: number   // raw hours × wage × payrollBurden (2 dp)
  price:     number   // (labor + materials) / markup (2 dp)
}

/**
 * Baseboard hours formula (mirrors sheet N column for baseboard row):
 *   (lnft / productionRate) + (lnft / tapeLine)
 *   Term 1 (paintBaseboards)        = lnft / lnftPerHr (per baseboard type)
 *   Term 2 (tapeFloorsFromBaseboards) = lnft / tapeLine (40 lnft/hr)
 *
 * Baseboard gallons formula:
 *   ceil( (lnft × (baseboardWidthIn/12) / coverage) × coatMultiplier )
 *   sameColor = 1 coat, all others = 2 coats
 *   Paint product = trim paint (option.paints.trim)
 */
export function calculateBaseboardCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  constants:     InteriorProductionConstants,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): BaseboardCalc {
  const tapeLineRate    = rates.prepWork.tapeLine ?? 40
  const widthFt         = (constants.baseboardWidthIn ?? 4) / 12

  const product         = paintProducts.find(p => p.id === option.paints.trim)
  const coverage        = product?.coverage       ?? 400
  const pricePerGallon  = product?.pricePerGallon ?? 0

  let paintBaseboardsHours = 0
  let totalLnft            = 0
  let totalRawGallons      = 0

  for (const section of option.baseboards) {
    const lnftPerHr = rates.baseboardTypes[section.baseboardType]
    if (!lnftPerHr) continue

    let sectionLnft = 0
    for (const m of section.measurements) {
      sectionLnft += m.length === '' ? 0 : m.length
    }
    if (sectionLnft === 0) continue

    paintBaseboardsHours += sectionLnft / lnftPerHr
    totalLnft            += sectionLnft

    const coatMult = 2 - (SAME_COLOR_BASEBOARD_KEYS.has(section.baseboardType) ? 1 : 0)
    totalRawGallons += (sectionLnft * widthFt / coverage) * coatMult
  }

  if (paintBaseboardsHours === 0) {
    return { hours: 0, gallons: 0, laborCost: 0, price: 0 }
  }

  const tapeFloorsHours = totalLnft / tapeLineRate
  const totalHours      = paintBaseboardsHours + tapeFloorsHours
  const hours           = Math.round(totalHours * 100) / 100
  const gallons         = Math.ceil(totalRawGallons)

  const rawLaborCost = totalHours * rules.wage * rules.payrollBurden
  const laborCost    = Math.round(rawLaborCost * 100) / 100

  const markup = 1 - (
    rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin +
    rules.salesMargin + rules.productionMgmtMargin
  )
  const materials = gallons * pricePerGallon
  const price = markup > 0 ? Math.round((rawLaborCost + materials) / markup * 100) / 100 : 0

  return { hours, gallons, laborCost, price }
}

// ── Painter Hourly Overview ────────────────────────────────────────────────────

export interface PainterOverview {
  // ── Task rows (hours) ──────────────────────────────────────────────────────
  paintWalls:                   number
  tapeCaulkWallsToBaseboards:   number
  handCutLineWallsToCeilings:   number
  paintCeilings:                number
  maskFloorMoveFurniture:       number   // TODO: formula needed
  paintBaseboards:              number
  tapeFloorsFromBaseboards:     number
  doors:                        number   // TODO: formula needed
  doorFrames:                   number   // TODO: formula needed
  windows:                      number   // TODO: formula needed
  miscellaneous:                number   // TODO: formula needed
  other:                        number
  tapeCaulkLineWallsToCeilings: number
  setupAndCleanUp:              number
  totalHoursByRoom:             number

  // ── Summary rows ──────────────────────────────────────────────────────────
  wallsTotal:       number   // paintWalls + tapeCaulk + handCut
  ceilingsTotal:    number   // paintCeilings
  baseboardsTotal:  number   // paintBaseboards + tapeFloors
  paintingAllTrim:  number   // doors + doorFrames + windows + miscellaneous
  allPrep:          number   // ROUNDUP(tapeCaulk+maskFloor+tapeFloors+tapeCaulkLine+setup, 2)

  // ── Materials & Labor ─────────────────────────────────────────────────────
  wallGallons:      number
  ceilingGallons:   number
  baseboardGallons: number
  recycleFee:      number   // totalGallons × avgRecycleFee (rounded for display)
  sundries:        number   // allPrepRaw × sundriesPerHour (rounded for display)
  materialsTotal:  number   // paint costs + recycleFee + sundries
  laborTotal:      number   // totalHours × wage

  // ── Raw (unrounded) values for downstream cost calculations ───────────────
  setupAndCleanUpRaw:       number  // unrounded K16
  rawProductiveLaborCost:   number  // productiveHours × wage × burden (excludes setup/cleanup)
  rawRecycleFee:            number  // unrounded D25
  rawSundries:              number  // unrounded D26
  rawPaintCost:             number  // unrounded paint gallons × price
}

/**
 * Builds the full painter hourly breakdown shown in the Hours Breakdown By Room
 * spreadsheet. Rows marked TODO use 0 until their formulas are added.
 */
export function calculatePainterOverview(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  constants:     InteriorProductionConstants,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): PainterOverview {
  const tapingRate = rates.prepWork.tapeLineCaulking ?? 30

  // ── Paint Walls / Tape Caulk / Hand Cut ─────────────────────────────────
  let paintWalls                 = 0
  let tapeCaulkWallsToBaseboards = 0
  let handCutLineWallsToCeilings = 0

  for (const section of option.walls) {
    const wallRate = rates.wallTypes[section.wallType]
    if (!wallRate) continue

    let sectionLength = 0
    let sectionSqft   = 0
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const h = m.height === '' ? 0 : m.height
      sectionLength += l
      sectionSqft   += l * h
    }

    paintWalls                 += sectionSqft   / wallRate.sqftPerHr
    tapeCaulkWallsToBaseboards += sectionLength / tapingRate
    handCutLineWallsToCeilings += sectionLength / wallRate.handCut
  }

  // ── Paint Ceilings + Mask Floor ──────────────────────────────────────────
  // Formula: N14 = (ceilingSqft / sqftPerHr) + (ceilingSqft / maskingFlooringRate)
  // Term 1 (paintCeilings)     = sqft / sqftPerHr  (per section, supports multiple types)
  // Term 2 (maskFloorMoveFurniture) = totalCeilingSqft / maskingFlooring (250)
  let paintCeilings      = 0
  let totalCeilingSqft   = 0
  for (const section of option.ceilings) {
    const sqftPerHr = rates.ceilingTypes[section.ceilingType]
    if (!sqftPerHr) continue
    let sectionSqft = 0
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const w = m.width  === '' ? 0 : m.width
      sectionSqft += l * w
    }
    paintCeilings    += sectionSqft / sqftPerHr
    totalCeilingSqft += sectionSqft
  }

  const maskingFlooringRate  = rates.prepWork.maskingFlooring ?? 250
  const maskFloorMoveFurniture = totalCeilingSqft > 0 ? totalCeilingSqft / maskingFlooringRate : 0

  // tapeCaulkLineWallsToCeilings: used when painting ceilings WITHOUT walls (needs ceiling perimeter)
  const tapeCaulkLineWallsToCeilings = 0  // TODO

  // ── Baseboards ───────────────────────────────────────────────────────────
  const tapeLineRate_ = rates.prepWork.tapeLine ?? 40
  const widthFt_      = (constants.baseboardWidthIn ?? 4) / 12
  let paintBaseboards      = 0
  let totalBaseboardLnft   = 0
  let baseboardRawGallons  = 0
  const baseboardProduct  = paintProducts.find(p => p.id === option.paints.trim)
  const baseboardCoverage = baseboardProduct?.coverage       ?? 400
  const baseboardPrice_   = baseboardProduct?.pricePerGallon ?? 0

  for (const section of option.baseboards) {
    const lnftPerHr = rates.baseboardTypes[section.baseboardType]
    if (!lnftPerHr) continue
    let sectionLnft = 0
    for (const m of section.measurements) {
      sectionLnft += m.length === '' ? 0 : m.length
    }
    paintBaseboards    += sectionLnft / lnftPerHr
    totalBaseboardLnft += sectionLnft
    const coatMult = 2 - (SAME_COLOR_BASEBOARD_KEYS.has(section.baseboardType) ? 1 : 0)
    baseboardRawGallons += (sectionLnft * widthFt_ / baseboardCoverage) * coatMult
  }
  const tapeFloorsFromBaseboards = totalBaseboardLnft > 0 ? totalBaseboardLnft / tapeLineRate_ : 0
  const baseboardGallons = Math.ceil(baseboardRawGallons)
  const doors                    = 0  // TODO
  const doorFrames               = 0  // TODO
  const windows                  = 0  // TODO
  const miscellaneous            = 0  // TODO

  // ── Other ────────────────────────────────────────────────────────────────
  const other = option.otherEntries.reduce(
    (sum, e) => sum + (e.hours === '' ? 0 : e.hours), 0
  )

  // ── Set up and Clean Up ──────────────────────────────────────────────────
  // = (all productive hours) / cleanupHoursRatio
  const productiveHours =
    paintWalls + tapeCaulkWallsToBaseboards + handCutLineWallsToCeilings +
    paintCeilings + maskFloorMoveFurniture +
    paintBaseboards + tapeFloorsFromBaseboards +
    doors + doorFrames + windows + miscellaneous +
    other + tapeCaulkLineWallsToCeilings

  const setupAndCleanUp = productiveHours / (constants.cleanupHoursRatio ?? 16)

  const totalHoursByRoom = productiveHours + setupAndCleanUp

  // ── Wall gallons ─────────────────────────────────────────────────────────
  const wallProduct  = paintProducts.find(p => p.id === option.paints.wall)
  const wallCoverage = wallProduct?.coverage        ?? 400
  const wallPrice    = wallProduct?.pricePerGallon  ?? 0
  let wallRawGallons = 0
  for (const section of option.walls) {
    let sectionSqft = 0
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const h = m.height === '' ? 0 : m.height
      sectionSqft += l * h
    }
    const coatMult = 2 - (SAME_COLOR_WALL_KEYS.has(section.wallType) ? 1 : 0)
    wallRawGallons += (sectionSqft / wallCoverage) * coatMult
  }
  const wallGallons = Math.ceil(wallRawGallons)

  // ── Ceiling gallons ───────────────────────────────────────────────────────
  const ceilingProduct  = paintProducts.find(p => p.id === option.paints.ceiling)
  const ceilingCoverage = ceilingProduct?.coverage       ?? 400
  const ceilingPrice_   = ceilingProduct?.pricePerGallon ?? 0
  let ceilingRawGallons = 0
  for (const section of option.ceilings) {
    let sectionSqft = 0
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const w = m.width  === '' ? 0 : m.width
      sectionSqft += l * w
    }
    const coatMult = 2 - (SAME_COLOR_CEILING_KEYS.has(section.ceilingType) ? 1 : 0)
    ceilingRawGallons += (sectionSqft / ceilingCoverage) * coatMult
  }
  const ceilingGallons = Math.ceil(ceilingRawGallons)

  // ── Materials & Labor ────────────────────────────────────────────────────
  const totalGallons = wallGallons + ceilingGallons + baseboardGallons  // + trimGallons + ... (TODO)

  // avgRecycleFee = average of 1-gal and 5-gal recycle fees (Inputs!B32)
  const avgRecycleFee  = (rules.recycleFeeGallon + rules.recycleFeeFiveGal) / 2
  const rawRecycleFee  = totalGallons > 0 ? totalGallons * avgRecycleFee : 0
  const recycleFee     = Math.round(rawRecycleFee * 100) / 100   // rounded for display

  // sundries = allPrepRaw × sundriesPerHour (uses unrounded prep hours, Inputs!B35)
  const allPrepRaw   = tapeCaulkWallsToBaseboards + maskFloorMoveFurniture +
                       tapeFloorsFromBaseboards + tapeCaulkLineWallsToCeilings + setupAndCleanUp
  const rawSundries  = allPrepRaw > 0 ? allPrepRaw * constants.sundriesPerHour : 0
  const sundries     = Math.round(rawSundries * 100) / 100        // rounded for display

  // materialsTotal = paint costs + recycle fee + sundries (SUM D19:D27)
  // Uses raw (unrounded) component values so precision matches the sheet's SUM formula
  const paintCost      = wallGallons * wallPrice + ceilingGallons * ceilingPrice_ + baseboardGallons * baseboardPrice_
  const materialsTotal = Math.round((paintCost + rawRecycleFee + rawSundries) * 100) / 100

  // laborTotal = totalHours × wage (B29 × Inputs!B10)
  const laborTotal = Math.round(totalHoursByRoom * rules.wage * 100) / 100

  // ── Summary rows ─────────────────────────────────────────────────────────
  const wallsTotal      = paintWalls + tapeCaulkWallsToBaseboards + handCutLineWallsToCeilings
  const ceilingsTotal   = paintCeilings + tapeCaulkLineWallsToCeilings
  const baseboardsTotal = paintBaseboards + tapeFloorsFromBaseboards
  const paintingAllTrim = doors + doorFrames + windows + miscellaneous
  // All Prep = ROUNDUP(K4+K7+K9+K15+K16, 2)
  const allPrep         = Math.ceil(allPrepRaw * 100) / 100

  const r2 = (n: number) => Math.round(n * 100) / 100

  return {
    paintWalls:                   r2(paintWalls),
    tapeCaulkWallsToBaseboards:   r2(tapeCaulkWallsToBaseboards),
    handCutLineWallsToCeilings:   r2(handCutLineWallsToCeilings),
    paintCeilings:                r2(paintCeilings),
    maskFloorMoveFurniture:       r2(maskFloorMoveFurniture),
    paintBaseboards:              r2(paintBaseboards),
    tapeFloorsFromBaseboards:     r2(tapeFloorsFromBaseboards),
    doors:                        r2(doors),
    doorFrames:                   r2(doorFrames),
    windows:                      r2(windows),
    miscellaneous:                r2(miscellaneous),
    other:                        r2(other),
    tapeCaulkLineWallsToCeilings: r2(tapeCaulkLineWallsToCeilings),
    setupAndCleanUp:              r2(setupAndCleanUp),
    totalHoursByRoom:             r2(totalHoursByRoom),
    wallsTotal:                   r2(wallsTotal),
    ceilingsTotal:                r2(ceilingsTotal),
    baseboardsTotal:              r2(baseboardsTotal),
    paintingAllTrim:              r2(paintingAllTrim),
    allPrep,
    wallGallons,
    ceilingGallons,
    baseboardGallons,
    recycleFee,
    sundries,
    materialsTotal,
    laborTotal,
    setupAndCleanUpRaw:     setupAndCleanUp,
    rawProductiveLaborCost: productiveHours * rules.wage * rules.payrollBurden,
    rawRecycleFee,
    rawSundries,
    rawPaintCost:           paintCost,
  }
}

// ── Cost and Price Breakdown ──────────────────────────────────────────────────

export interface CostBreakdown {
  grandTotal:       number   // (labor + paint) before overhead
  setupAndCleanUp:  number   // (setupHours × wage × burden) / markup
  combiningSavings: number   // 0 for now
  sundriesAndFees:  number   // (sundries + recycleFee + tax) / markup
  subtotal:         number   // round(sum / (1 − salesDiscount)) — whole dollars when tax=0
  totalPrice:       number   // same as subtotal until further formula is provided
}

/**
 * Cost and Price Breakdown formulas (mirrors Google Sheet):
 *
 * Grand Total   = (totalHours × wage × payrollBurden + paintCost) / markup
 * Setup/Cleanup = (setupHours × wage × payrollBurden) / markup
 * Sundries&Fees = (rawSundries + rawRecycleFee + tax) / markup
 *                 where tax = sum(D19:D26) × materialTaxRate  (currently 0%)
 * Subtotal      = if(materialTaxRate=0, round(sum / (1−salesDiscount), 0),
 *                                        sum / (1−salesDiscount))
 *                 salesDiscount = 0.10
 * Combining Savings = 0 (not yet implemented)
 * Total Price   = subtotal
 */
export function calculateCostBreakdown(
  po:    PainterOverview,
  rules: InteriorBusinessRules,
): CostBreakdown {
  const markup = 1 - (
    rules.netProfitMargin +
    rules.overheadMargin +
    rules.marketingMargin +
    rules.salesMargin +
    rules.productionMgmtMargin
  )

  if (markup <= 0) {
    return { grandTotal: 0, setupAndCleanUp: 0, combiningSavings: 0, sundriesAndFees: 0, subtotal: 0, totalPrice: 0 }
  }

  // Grand Total = (productiveHours × wage × burden + paintCost) / markup
  // Uses productive hours only — setup/cleanup is its own line item below
  const grandTotal = Math.round((po.rawProductiveLaborCost + po.rawPaintCost) / markup * 100) / 100

  // Setup & Clean Up cost = (setupHours × wage × burden) / markup
  const setupCost = Math.round(
    (po.setupAndCleanUpRaw * rules.wage * rules.payrollBurden) / markup * 100
  ) / 100

  // Combining savings — not yet implemented
  const combiningSavings = 0

  // Sundries & Fees = (rawSundries + rawRecycleFee + tax) / markup
  // materialTaxRate = 0 so tax = 0
  const tax = 0
  const sundriesAndFees = Math.round(
    (po.rawSundries + po.rawRecycleFee + tax) / markup * 100
  ) / 100

  // Subtotal = (grand total + setup/cleanup + sundries − combining savings) / (1 − salesDiscount)
  // Use raw (pre-round) values so precision matches the sheet
  const rawGrandTotal      = (po.rawProductiveLaborCost + po.rawPaintCost) / markup
  const rawSetupCost       = (po.setupAndCleanUpRaw * rules.wage * rules.payrollBurden) / markup
  const rawSundriesAndFees = (po.rawSundries + po.rawRecycleFee) / markup
  const rawSubtotalSum     = rawGrandTotal + rawSetupCost + rawSundriesAndFees - combiningSavings

  const salesDiscount = rules.salesDiscount ?? 0.10
  const subtotal = Math.round(rawSubtotalSum / (1 - salesDiscount) * 100) / 100

  const totalPrice = subtotal

  return {
    grandTotal,
    setupAndCleanUp:  setupCost,
    combiningSavings,
    sundriesAndFees,
    subtotal,
    totalPrice,
  }
}
