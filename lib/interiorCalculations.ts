// ── Interior Estimate Calculations ────────────────────────────────────────────
//
// Mirrors the Google Sheet formulas exactly.
// All functions are pure — no side effects, no Firestore.

import type { RoomOption } from '@/types/interiorEstimate'
import type { InteriorProductionRates, InteriorPaintProduct, InteriorBusinessRules } from '@/types/interiorSettings'

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
