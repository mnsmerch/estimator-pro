// ── Interior Estimate Settings ────────────────────────────────────────────────

export interface InteriorBusinessRules {
  // Labor
  wage:                 number   // $/hr
  payrollBurden:        number   // multiplier (1 = no burden)

  // Margins (stored as decimals, e.g. 0.21)
  netProfitMargin:      number
  overheadMargin:       number
  marketingMargin:      number
  salesMargin:          number
  productionMgmtMargin: number
  // markup = 1 - sum(margins above) — auto-calculated, not stored

  // Payment
  depositPercent:       number
  salesDiscount:        number

  // Materials
  materialTaxRate:      number
  recycleFeeGallon:     number   // 1-gal recycle fee
  recycleFeeFiveGal:    number   // 5-gal recycle fee
  // avgRecycleFee = average(recycleFeeGallon, recycleFeeFiveGal) — auto-calculated
}

export interface InteriorPaintProduct {
  id:             string
  name:           string
  pricePerGallon: number
  coverage:       number   // sq ft per gallon
}

export interface WallTypeRate {
  sqftPerHr: number
  handCut:   number
}

export interface DoorBaseRate {
  hours: number
  lnft:  number
}

export interface MiscTrimRate {
  lnftPerHr: number
  paint:     number
}

export interface InteriorProductionRates {
  prepWork:         Record<string, number>
  wallTypes:        Record<string, WallTypeRate>
  ceilingTypes:     Record<string, number>
  baseboardTypes:   Record<string, number>   // lnft/hr per baseboard type
  doorTypes:        Record<string, DoorBaseRate>
  doorFrameTypes:   Record<string, DoorBaseRate>
  windowTypes:      Record<string, DoorBaseRate>
  miscTrimTypes:    Record<string, MiscTrimRate>
  sameColorOptions: Record<string, number>
  miscSqftTypes:    Record<string, number>
  miscHourlyTypes:  Record<string, number>
  // more categories added as they come in
}

export interface InteriorProductionConstants {
  cleanupHoursRatio: number   // work hours per 1 cleanup hour (e.g. 16 → 1 hr cleanup per 16 hrs work)
  sundriesPerHour:   number   // $ per hour of prep
  baseboardWidthIn:  number   // inches
  doorFrameWidthIn:  number   // inches
  windowTrimWidthIn: number   // inches
  miscTrimWidthIn:   number   // inches
}
