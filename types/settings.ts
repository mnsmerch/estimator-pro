export interface CompanySettings {
  name: string
  phone: string
  email: string
  website: string
  streetAddress: string
  cityStateZip: string
  licenseNumber?: string
  logoUrl?: string
}

export interface BusinessRules {
  wage: number
  payrollBurden: number
  netProfitMargin: number       // stored as decimal e.g. 0.20
  overheadMargin: number
  marketingMargin: number
  salesMargin: number
  productionMgmtMargin: number
  additionalMargin1: number
  additionalMargin2: number
  additionalMargin3: number
  additionalMargin4: number
  additionalMargin5: number
  depositPercent: number
  salesDiscount: number
  woodReplacementMinimum: number
  salesTax: number
}

export interface ProductionConstants {
  paintCoverageSpray: number
  paintCoverageBrushRoll: number
  cleanupHoursRatio: number
  fasciaWidthIn: number
  eavesWidthIn: number
  otherTrimWidthIn: number
  railingsTrimRatio: number
  windowTrimWidthIn: number
  downspoutWidthIn: number
  shutterSqft: number
  stainCoverage: number
  sundriesPerHour: number
}

export interface PaintProduct {
  id: string
  name: string
  singleGallon: number
  fiveGallon: number
  coverage: number  // sq ft per gallon
}

// Rate types
export interface TrimRate {
  unitsPerHr: number
  trimLnFt: number
}

export interface StainingRateItem {
  rate: number
  surfaceAreaFactor: number
}

/** Admin-defined application option added on top of the built-in catalog. */
export interface CustomApplication {
  id:                 string   // unique, e.g. 'custom-...'
  categoryKey:        string   // one of the supported category keys
  categoryLabel:      string   // display group label
  label:              string   // line-item name shown in the dropdown
  unitLabel:          string   // 'SqFt' | 'LnFt' | 'Units' | 'Hrs' | '#'
  rate:               number   // production rate = units per hour
  surfaceAreaFactor?: number   // staining only — sq ft per unit for paint gallons
}

export interface ProductionRates {
  prepWork: Record<string, number>
  bodyApplication: Record<string, number>
  eaves: Record<string, number>
  fascia: Record<string, number>
  windows: Record<string, TrimRate>
  otherTrim: Record<string, number>
  doors: Record<string, TrimRate>
  sidelights: Record<string, TrimRate>
  garageDoors: Record<string, TrimRate>
  railings: Record<string, number>
  shutters: Record<string, number>
  staining: Record<string, StainingRateItem>
  woodReplacement: Record<string, number>
  // Admin-added custom application options (appended to the built-in catalog)
  customApplications?: CustomApplication[]
}
