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

// Misc trim types that count as "same color" (1 coat for gallons)
const SAME_COLOR_MISC_TRIM_KEYS = new Set([
  'otherTrimSameColor',
  'stairStringerSameColor',
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

// ── Door Calculations ─────────────────────────────────────────────────────────

export interface DoorCalc {
  hours:     number
  gallons:   number
  laborCost: number
  price:     number
}

/**
 * Door hours:   sum( count × hours_per_door ) across all door entries
 * Door gallons: ceil( sum( (count × lnft × (1/3)) / coverage × coatMultiplier ) )
 *   lnft comes from doorTypes lookup (e.g. 55 for 1 side, 110 for both sides)
 *   (1/3) = door surface width factor
 *   coatMultiplier = 2 for all standard door types
 * Paint product = trim paint (option.paints.trim)
 */
export function calculateDoorCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): DoorCalc {
  const product        = paintProducts.find(p => p.id === option.paints.trim)
  const coverage       = product?.coverage       ?? 400
  const pricePerGallon = product?.pricePerGallon ?? 0

  let totalHours      = 0
  let totalRawGallons = 0

  for (const entry of option.doors) {
    const doorRate = rates.doorTypes[entry.doorType]
    if (!doorRate) continue
    const count = entry.count === '' ? 0 : entry.count
    if (count === 0) continue

    totalHours      += count * doorRate.hours
    // gallons = (count × lnft × (1/3)) / coverage × 2 coats
    totalRawGallons += (count * doorRate.lnft * (1 / 3)) / coverage * 2
  }

  if (totalHours === 0) return { hours: 0, gallons: 0, laborCost: 0, price: 0 }

  const hours      = Math.round(totalHours * 100) / 100
  const gallons    = Math.ceil(totalRawGallons)
  const rawLabor   = totalHours * rules.wage * rules.payrollBurden
  const laborCost  = Math.round(rawLabor * 100) / 100

  const markup = 1 - (
    rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin +
    rules.salesMargin + rules.productionMgmtMargin
  )
  const materials = gallons * pricePerGallon
  const price = markup > 0 ? Math.round((rawLabor + materials) / markup * 100) / 100 : 0

  return { hours, gallons, laborCost, price }
}

// ── Door Frame Calc ────────────────────────────────────────────────────────────

export function calculateDoorFrameCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  constants:     InteriorProductionConstants,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): DoorCalc {
  const product        = paintProducts.find(p => p.id === option.paints.trim)
  const coverage       = product?.coverage       ?? 400
  const pricePerGallon = product?.pricePerGallon ?? 0
  const widthFt        = (constants.doorFrameWidthIn ?? 4) / 12

  let totalHours      = 0
  let totalRawGallons = 0

  for (const entry of option.doorFrames) {
    const frameRate = rates.doorFrameTypes[entry.doorFrameType]
    if (!frameRate) continue
    const count = entry.count === '' ? 0 : entry.count
    if (count === 0) continue
    totalHours      += count * frameRate.hours
    totalRawGallons += (count * frameRate.lnft * widthFt / coverage) * 2
  }

  if (totalHours === 0) return { hours: 0, gallons: 0, laborCost: 0, price: 0 }

  const hours     = Math.round(totalHours * 100) / 100
  const gallons   = Math.ceil(totalRawGallons)
  const rawLabor  = totalHours * rules.wage * rules.payrollBurden
  const laborCost = Math.round(rawLabor * 100) / 100
  const markup    = 1 - (rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin + rules.salesMargin + rules.productionMgmtMargin)
  const price     = markup > 0 ? Math.round((rawLabor + gallons * pricePerGallon) / markup * 100) / 100 : 0

  return { hours, gallons, laborCost, price }
}

// ── Window Calc ────────────────────────────────────────────────────────────────

export function calculateWindowCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  constants:     InteriorProductionConstants,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): DoorCalc {
  const product        = paintProducts.find(p => p.id === option.paints.trim)
  const coverage       = product?.coverage       ?? 400
  const pricePerGallon = product?.pricePerGallon ?? 0
  const widthFt        = (constants.windowTrimWidthIn ?? 4) / 12

  let totalHours      = 0
  let totalRawGallons = 0

  for (const entry of option.windows) {
    const winRate = rates.windowTypes[entry.windowType]
    if (!winRate) continue
    const count = entry.count === '' ? 0 : entry.count
    if (count === 0) continue
    totalHours      += count * winRate.hours
    totalRawGallons += (count * winRate.lnft * widthFt / coverage) * 2
  }

  if (totalHours === 0) return { hours: 0, gallons: 0, laborCost: 0, price: 0 }

  const hours     = Math.round(totalHours * 100) / 100
  const gallons   = Math.ceil(totalRawGallons)
  const rawLabor  = totalHours * rules.wage * rules.payrollBurden
  const laborCost = Math.round(rawLabor * 100) / 100
  const markup    = 1 - (rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin + rules.salesMargin + rules.productionMgmtMargin)
  const price     = markup > 0 ? Math.round((rawLabor + gallons * pricePerGallon) / markup * 100) / 100 : 0

  return { hours, gallons, laborCost, price }
}

// ── Misc Calc ──────────────────────────────────────────────────────────────────

export function calculateMiscCalc(
  option:        RoomOption,
  rates:         InteriorProductionRates,
  constants:     InteriorProductionConstants,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): DoorCalc {
  // Misc uses its own paint (separate from trim); defaults to $0 if not set
  const miscCoverage = (paintProducts.find(p => p.id === option.paints.trim)?.coverage) ?? 400
  const miscPrice    = 0   // "No Paint or Paint Provided" — $0 cost for misc paint
  const widthFt      = (constants.miscTrimWidthIn ?? 4) / 12

  let totalHours      = 0
  let totalRawGallons = 0

  for (const entry of option.miscLinearFeetEntries) {
    const trimRate = rates.miscTrimTypes[entry.miscTrimType]
    if (!trimRate) continue
    const lf = entry.linearFeet === '' ? 0 : entry.linearFeet
    if (lf === 0) continue
    const coatMult = 2 - (SAME_COLOR_MISC_TRIM_KEYS.has(entry.miscTrimType) ? 1 : 0)
    totalHours      += lf / trimRate.lnftPerHr
    // paint field is a surface-area multiplier (e.g. railings paint:25 → 25× more surface per lnft)
    totalRawGallons += (lf * trimRate.paint * widthFt / miscCoverage) * coatMult
  }

  for (const entry of option.miscSquareFeetEntries) {
    const sqftPerHr = rates.miscSqftTypes[entry.miscSqftType]
    if (!sqftPerHr) continue
    const sf = entry.squareFeet === '' ? 0 : entry.squareFeet
    if (sf === 0) continue
    totalHours      += sf / sqftPerHr
    totalRawGallons += sf / miscCoverage * 2
  }

  for (const entry of option.miscHourlyEntries) {
    const hrsPerUnit = rates.miscHourlyTypes[entry.miscHourlyType]
    if (!hrsPerUnit) continue
    const units = entry.units === '' ? 0 : entry.units
    totalHours += units * hrsPerUnit
  }

  if (totalHours === 0) return { hours: 0, gallons: 0, laborCost: 0, price: 0 }

  const hours     = Math.round(totalHours * 100) / 100
  const gallons   = Math.ceil(totalRawGallons)
  const rawLabor  = totalHours * rules.wage * rules.payrollBurden
  const laborCost = Math.round(rawLabor * 100) / 100
  const markup    = 1 - (rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin + rules.salesMargin + rules.productionMgmtMargin)
  const price     = markup > 0 ? Math.round((rawLabor + gallons * miscPrice) / markup * 100) / 100 : 0

  return { hours, gallons, laborCost, price }
}

// ── Other Calc ────────────────────────────────────────────────────────────────

/**
 * Other (no standard for) — user enters hours and gallons directly.
 * Paint product = option.paints.other (falls back to wall paint price if not set).
 * Labor and price use the same markup as all other sections.
 */
export function calculateOtherCalc(
  option:        RoomOption,
  paintProducts: InteriorPaintProduct[],
  rules:         InteriorBusinessRules,
): DoorCalc {
  let totalHours   = 0
  let totalGallons = 0

  for (const entry of option.otherEntries) {
    totalHours   += entry.hours   === '' ? 0 : entry.hours
    totalGallons += entry.gallons === '' ? 0 : entry.gallons
  }

  if (totalHours === 0 && totalGallons === 0) return { hours: 0, gallons: 0, laborCost: 0, price: 0 }

  const otherProduct  = paintProducts.find(p => p.id === option.paints.other)
                     ?? paintProducts.find(p => p.id === option.paints.wall)
  const pricePerGallon = otherProduct?.pricePerGallon ?? 0

  const rawLabor  = totalHours * rules.wage * rules.payrollBurden
  const laborCost = Math.round(rawLabor * 100) / 100

  const markup = 1 - (
    rules.netProfitMargin + rules.overheadMargin + rules.marketingMargin +
    rules.salesMargin + rules.productionMgmtMargin
  )
  const price = markup > 0
    ? Math.round((rawLabor + totalGallons * pricePerGallon) / markup * 100) / 100
    : 0

  return {
    hours:    totalHours,
    gallons:  totalGallons,
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
  paintCeilings:                number
  maskFloorMoveFurniture:       number   // TODO: formula needed
  paintBaseboards:              number
  tapeFloorsFromBaseboards:     number
  doors:                        number
  doorFrames:                   number   // TODO: formula needed
  windows:                      number   // TODO: formula needed
  miscellaneous:                number   // TODO: formula needed
  other:                        number
  tapeCaulkLineWallsToCeilings: number
  setupAndCleanUp:              number
  totalHoursByRoom:             number

  // ── Summary rows ──────────────────────────────────────────────────────────
  wallsTotal:       number   // ROUNDUP(paintWalls + tapeCaulk + handCut, 2)
  ceilingsTotal:    number   // ROUNDUP(paintCeilings + maskFloor, 2)
  baseboardsTotal:  number   // ROUNDUP(paintBaseboards + tapeFloors, 2)
  paintingAllTrim:  number   // ROUNDUP(paintBaseboards + doors + doorFrames + windows + miscellaneous, 2)
  allPrep:          number   // ROUNDUP(tapeCaulk+maskFloor+tapeFloors+tapeCaulkLine+setup, 2)

  // ── Materials & Labor ─────────────────────────────────────────────────────
  wallGallons:      number
  ceilingGallons:   number
  trimGallons:      number   // ROUNDUP(baseboards+doors+frames+windows raw gallons, 0) — no misc
  miscGallons:      number   // ROUNDUP(misc linear+sqft raw gallons, 0) — separate from trim
  otherGallons:     number   // sum of user-entered gallons from otherEntries
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

    const isSameColorWall = SAME_COLOR_WALL_KEYS.has(section.wallType)

    let sectionLength = 0
    let sectionSqft   = 0
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const h = m.height === '' ? 0 : m.height
      sectionLength += l
      sectionSqft   += l * h
    }

    paintWalls += sectionSqft / wallRate.sqftPerHr

    // K4: same-color walls → no tape caulk needed (D13=TRUE skips in sheet)
    if (!isSameColorWall) {
      tapeCaulkWallsToBaseboards += sectionLength / tapingRate
    }

    // K5: always apply hand cut when walls are present
    // D12 (sheet condition to skip) has no equivalent in our scope — default to always calculating
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
  // ── Doors ────────────────────────────────────────────────────────────────
  let doors           = 0
  let doorRawGallons  = 0
  const doorProduct   = paintProducts.find(p => p.id === option.paints.trim)
  const doorCoverage  = doorProduct?.coverage       ?? 400
  const doorPrice_    = doorProduct?.pricePerGallon ?? 0

  for (const entry of option.doors) {
    const doorRate = rates.doorTypes[entry.doorType]
    if (!doorRate) continue
    const count = entry.count === '' ? 0 : entry.count
    if (count === 0) continue
    doors          += count * doorRate.hours
    doorRawGallons += (count * doorRate.lnft * (1 / 3)) / doorCoverage * 2
  }
  // ── Door Frames ──────────────────────────────────────────────────────────
  // Gallons: (count × frameType.lnft × doorFrameWidthIn/12 / coverage) × coatMult
  // Hours:   count × frameType.hours
  const doorFrameWidthFt = (constants.doorFrameWidthIn ?? 4) / 12
  let doorFrames           = 0
  let doorFrameRawGallons  = 0

  for (const entry of option.doorFrames) {
    const frameRate = rates.doorFrameTypes[entry.doorFrameType]
    if (!frameRate) continue
    const count = entry.count === '' ? 0 : entry.count
    if (count === 0) continue
    // No same-color door frame types defined yet — always 2 coats
    doorFrames          += count * frameRate.hours
    doorFrameRawGallons += (count * frameRate.lnft * doorFrameWidthFt / (doorProduct?.coverage ?? 400)) * 2
  }

  // ── Windows ──────────────────────────────────────────────────────────────
  // Gallons: (count × windowType.lnft × windowTrimWidthIn/12 / coverage) × coatMult
  // Hours:   count × windowType.hours
  const windowTrimWidthFt = (constants.windowTrimWidthIn ?? 4) / 12
  let windows           = 0
  let windowRawGallons  = 0

  for (const entry of option.windows) {
    const winRate = rates.windowTypes[entry.windowType]
    if (!winRate) continue
    const count = entry.count === '' ? 0 : entry.count
    if (count === 0) continue
    windows          += count * winRate.hours
    windowRawGallons += (count * winRate.lnft * windowTrimWidthFt / (doorProduct?.coverage ?? 400)) * 2
  }

  // ── Miscellaneous ────────────────────────────────────────────────────────
  // Three sub-types: linear feet (trim), square feet, hourly
  // Gallons: linear uses miscTrimWidthIn, sqft uses direct area; both via trim paint coverage
  const miscTrimWidthFt  = (constants.miscTrimWidthIn ?? 4) / 12
  const miscCoverage     = doorProduct?.coverage ?? 400   // trim paint coverage for misc
  let miscellaneous      = 0
  let miscRawGallons     = 0

  for (const entry of option.miscLinearFeetEntries) {
    const trimRate = rates.miscTrimTypes[entry.miscTrimType]
    if (!trimRate) continue
    const lf = entry.linearFeet === '' ? 0 : entry.linearFeet
    if (lf === 0) continue
    const coatMult = 2 - (SAME_COLOR_MISC_TRIM_KEYS.has(entry.miscTrimType) ? 1 : 0)
    miscellaneous  += lf / trimRate.lnftPerHr
    // paint field is a surface-area multiplier (e.g. railings paint:25 → 25× more surface per lnft)
    miscRawGallons += (lf * trimRate.paint * miscTrimWidthFt / miscCoverage) * coatMult
  }

  for (const entry of option.miscSquareFeetEntries) {
    const sqftPerHr = rates.miscSqftTypes[entry.miscSqftType]
    if (!sqftPerHr) continue
    const sf = entry.squareFeet === '' ? 0 : entry.squareFeet
    if (sf === 0) continue
    miscellaneous  += sf / sqftPerHr
    miscRawGallons += sf / miscCoverage * 2   // always 2 coats for sqft misc
  }

  for (const entry of option.miscHourlyEntries) {
    const hrsPerUnit = rates.miscHourlyTypes[entry.miscHourlyType]
    if (!hrsPerUnit) continue
    const units = entry.units === '' ? 0 : entry.units
    miscellaneous += units * hrsPerUnit
    // no gallons for hourly misc items
  }

  // Trim and misc gallons are separate rows in the sheet (misc uses its own paint selection)
  const trimGallons = Math.ceil(baseboardRawGallons + doorRawGallons + doorFrameRawGallons + windowRawGallons)
  const miscGallons = Math.ceil(miscRawGallons)

  // ── Other ────────────────────────────────────────────────────────────────
  let other        = 0
  let otherGallons = 0
  for (const e of option.otherEntries) {
    other        += e.hours   === '' ? 0 : e.hours
    otherGallons += e.gallons === '' ? 0 : e.gallons
  }

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

  // ── Other paint product ───────────────────────────────────────────────────
  const otherProduct      = paintProducts.find(p => p.id === option.paints.other)
                         ?? paintProducts.find(p => p.id === option.paints.wall)
  const otherPaintPrice_  = otherProduct?.pricePerGallon ?? 0

  // ── Materials & Labor ────────────────────────────────────────────────────
  const totalGallons = wallGallons + ceilingGallons + trimGallons + miscGallons + otherGallons

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
  const trimPrice_     = baseboardProduct?.pricePerGallon ?? 0
  const paintCost      = wallGallons * wallPrice + ceilingGallons * ceilingPrice_ + trimGallons * trimPrice_ + otherGallons * otherPaintPrice_
  const materialsTotal = Math.round((paintCost + rawRecycleFee + rawSundries) * 100) / 100

  // laborTotal = totalHours × wage (B29 × Inputs!B10)
  const laborTotal = Math.round(totalHoursByRoom * rules.wage * 100) / 100

  // ── Summary rows ─────────────────────────────────────────────────────────
  // Summary rows all use ROUNDUP (Math.ceil to 2dp) to match sheet formula
  const ru2 = (n: number) => Math.ceil(n * 100) / 100
  const wallsTotal      = ru2(paintWalls + tapeCaulkWallsToBaseboards + handCutLineWallsToCeilings)
  const ceilingsTotal   = ru2(paintCeilings + maskFloorMoveFurniture)
  const baseboardsTotal = ru2(paintBaseboards + tapeFloorsFromBaseboards)
  // Painting all Trim = K8+K10+K11+K12 (no miscellaneous — misc is its own row in sheet)
  const paintingAllTrim = ru2(paintBaseboards + doors + doorFrames + windows)
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
    wallsTotal,
    ceilingsTotal,
    baseboardsTotal,
    paintingAllTrim,
    allPrep,
    wallGallons,
    ceilingGallons,
    trimGallons,
    miscGallons,
    otherGallons,
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
