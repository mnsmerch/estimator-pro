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

// ── Painter Hourly Overview ────────────────────────────────────────────────────

export interface PainterOverview {
  // ── Task rows (hours) ──────────────────────────────────────────────────────
  paintWalls:                   number
  tapeCaulkWallsToBaseboards:   number
  handCutLineWallsToCeilings:   number
  paintCeilings:                number   // TODO: formula needed
  maskFloorMoveFurniture:       number   // TODO: formula needed
  paintBaseboards:              number   // TODO: formula needed
  tapeFloorsFromBaseboards:     number   // TODO: formula needed
  doors:                        number   // TODO: formula needed
  doorFrames:                   number   // TODO: formula needed
  windows:                      number   // TODO: formula needed
  miscellaneous:                number   // TODO: formula needed
  other:                        number
  tapeCaulkLineWallsToCeilings: number   // TODO: formula needed
  setupAndCleanUp:              number
  totalHoursByRoom:             number

  // ── Summary rows ──────────────────────────────────────────────────────────
  wallsTotal:       number   // paintWalls + tapeCaulk + handCut
  ceilingsTotal:    number   // paintCeilings
  baseboardsTotal:  number   // paintBaseboards + tapeFloors
  paintingAllTrim:  number   // doors + doorFrames + windows + miscellaneous
  allPrep:          number   // ROUNDUP(tapeCaulk+maskFloor+tapeFloors+tapeCaulkLine+setup, 2)

  // ── Materials & Labor ─────────────────────────────────────────────────────
  wallGallons:     number
  recycleFee:      number   // totalGallons × avgRecycleFee (rounded for display)
  sundries:        number   // allPrepRaw × sundriesPerHour (rounded for display)
  materialsTotal:  number   // paint costs + recycleFee + sundries
  laborTotal:      number   // totalHours × wage

  // ── Raw (unrounded) values for downstream cost calculations ───────────────
  setupAndCleanUpRaw: number  // unrounded K16
  rawRecycleFee:      number  // unrounded D25
  rawSundries:        number  // unrounded D26
  rawPaintCost:       number  // unrounded paint gallons × price
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

  // ── TODO sections (0 until formulas are added) ─────────────────────────
  const paintCeilings                = 0  // TODO
  const maskFloorMoveFurniture       = 0  // TODO
  const paintBaseboards              = 0  // TODO
  const tapeFloorsFromBaseboards     = 0  // TODO
  const doors                        = 0  // TODO
  const doorFrames                   = 0  // TODO
  const windows                      = 0  // TODO
  const miscellaneous                = 0  // TODO
  const tapeCaulkLineWallsToCeilings = 0  // TODO

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

  // ── Materials & Labor ────────────────────────────────────────────────────
  // totalGallons = sum of all paint type gallons (walls only for now, rest TODO)
  const totalGallons = wallGallons  // + ceilingGallons + trimGallons + ... (TODO)

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
  const paintCost      = wallGallons * wallPrice  // + ceiling + trim + ... (TODO)
  const materialsTotal = Math.round((paintCost + rawRecycleFee + rawSundries) * 100) / 100

  // laborTotal = totalHours × wage (B29 × Inputs!B10)
  const laborTotal = Math.round(totalHoursByRoom * rules.wage * 100) / 100

  // ── Summary rows ─────────────────────────────────────────────────────────
  const wallsTotal      = paintWalls + tapeCaulkWallsToBaseboards + handCutLineWallsToCeilings
  const ceilingsTotal   = paintCeilings
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
    recycleFee,
    sundries,
    materialsTotal,
    laborTotal,
    setupAndCleanUpRaw: setupAndCleanUp,
    rawRecycleFee,
    rawSundries,
    rawPaintCost:       paintCost,
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

  // Grand Total = (totalHours × wage × burden + paintCost) / markup
  // totalHours is stored rounded in po but laborTotal = totalHours × wage (already computed)
  // We use laborTotal (which used unrounded hours) as the labor component
  const laborComponent = po.laborTotal  // already = totalHoursByRoom × wage (rounded to 2dp)
  const grandTotal = Math.round((laborComponent * rules.payrollBurden + po.rawPaintCost) / markup * 100) / 100

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

  // Subtotal = grand total + setup/cleanup + sundries − combining savings
  const rawSum = grandTotal + setupCost + sundriesAndFees - combiningSavings

  // When materialTaxRate = 0: round to whole dollar; otherwise no rounding
  const salesDiscount = rules.salesDiscount ?? 0.10
  const subtotal = Math.round(rawSum / (1 - salesDiscount))

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
