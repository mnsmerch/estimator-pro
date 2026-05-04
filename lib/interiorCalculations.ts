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
  allPrep:          number   // maskFloor + tapeCaulkLine + setupAndCleanUp
}

/**
 * Builds the full painter hourly breakdown shown in the Hours Breakdown By Room
 * spreadsheet. Rows marked TODO use 0 until their formulas are added.
 */
export function calculatePainterOverview(
  option:    RoomOption,
  rates:     InteriorProductionRates,
  constants: InteriorProductionConstants,
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

  // ── Summary rows ─────────────────────────────────────────────────────────
  const wallsTotal      = paintWalls + tapeCaulkWallsToBaseboards + handCutLineWallsToCeilings
  const ceilingsTotal   = paintCeilings
  const baseboardsTotal = paintBaseboards + tapeFloorsFromBaseboards
  const paintingAllTrim = doors + doorFrames + windows + miscellaneous
  const allPrep         = maskFloorMoveFurniture + tapeCaulkLineWallsToCeilings + setupAndCleanUp

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
    allPrep:                      r2(allPrep),
  }
}
