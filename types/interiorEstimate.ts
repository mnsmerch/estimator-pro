// ── Interior Estimate Draft Types ────────────────────────────────────────────

export interface WallMeasurement {
  id:     string
  length: number | ''
  height: number | ''
}

export interface WallSection {
  id:           string
  wallType:     string        // key from InteriorProductionRates.wallTypes
  measurements: WallMeasurement[]
}

export interface CeilingMeasurement {
  id:     string
  length: number | ''
  width:  number | ''
}

export interface CeilingSection {
  id:           string
  ceilingType:  string        // key from InteriorProductionRates.ceilingTypes (incl. derived)
  measurements: CeilingMeasurement[]
}

export interface BaseboardMeasurement {
  id:     string
  length: number | ''
}

export interface BaseboardSection {
  id:            string
  baseboardType: string
  measurements:  BaseboardMeasurement[]
}

export interface WindowEntry {
  id:         string
  windowType: string
  count:      number | ''
}

export interface DoorEntry {
  id:       string
  doorType: string
  count:    number | ''
}

export interface DoorFrameEntry {
  id:            string
  doorFrameType: string
  count:         number | ''
}

export interface OtherEntry {
  id:          string
  description: string
  hours:       number | ''
  gallons:     number | ''
}

export interface MiscLinearFeetEntry {
  id:           string
  miscTrimType: string
  linearFeet:   number | ''
}

export interface MiscSquareFeetEntry {
  id:           string
  miscSqftType: string
  squareFeet:   number | ''
}

export interface MiscHourlyEntry {
  id:             string
  miscHourlyType: string
  units:          number | ''
}

export interface PaintSelections {
  wall:    string   // InteriorPaintProduct id
  ceiling: string
  trim:    string
  misc:    string
  other:   string
}

export interface RoomOption {
  id:       string
  name:     string
  coats:    number
  paints:   PaintSelections
  walls:      WallSection[]
  ceilings:   CeilingSection[]
  baseboards: BaseboardSection[]
  doors:      DoorEntry[]       // max 5
  doorFrames: DoorFrameEntry[]  // max 5
  windows:               WindowEntry[]     // max 2
  ceilingPerimeter:      number | ''
  miscLinearFeetEntries: MiscLinearFeetEntry[]
  miscSquareFeetEntries: MiscSquareFeetEntry[]
  miscHourlyEntries:     MiscHourlyEntry[]
  otherEntries:          OtherEntry[]
  // more measurement sections added incrementally
}

export interface InteriorScopeFields {
  projectDescription: string
  prepWork:           string
  finalTouches:       string
  paintProducts:      string
  totalColors:        string
  totalCoats:         string
}

export const INTERIOR_SCOPE_DEFAULTS: InteriorScopeFields = {
  projectDescription:
    '- Paint walls and ceiling for the entire house.\n- Prep & paint all doors, jambs & trim\n- Prep and paint all window trim\n- Prep & paint all baseboards\n- Paint fireplace hearth',
  prepWork:
    'For walls and ceiling:\n• Mask Floors\n• Cover Furniture\n• Caulk All Cracks\n• Refill All Nail Holes\n• Patch repairs & texture large fix\'s\n• Remove Electrical Plates\n• Remove Window Treatments\n\nFor trim:\n• Wipe clean any dirt & grime\n• Light sand.\n• Prime with shellac to ensure proper paint adhesion\n• Fill any nail holes\n• Light sand.\n• Remove dust & debris\n• Caulk any separating joints\n• Apply fine finish Emerald Urethane Enamel\n\nFor doors:\n• Remove Door Hinges\n• Remove Door Handles\n• Create an "Air-Bubble" Spray Booth\n• Sand Doors To Allow For Proper Adhesion\n• Spray shellac based primer\n• Fill any holes & deep scrapes\n• Sand doors\n• Remove dust & debris for a smooth finish\n• Spray 2 coats of Emerald urethane enamel using a Fine-Finish Paint Sprayer\n• Allow Dry Time\n• Re-Install Doors\n• Re-Install Hinges\n• Re-Install Handles\n• Quality Control Door(s) Open & Close Properly',
  finalTouches:
    '• Take off all of the masking.\n• Re-Install Electrical Plates\n• Re-Install Window Treatments.\n• Clean up all work areas\n• Final walk through with home owner\n• Balance due upon completion',
  paintProducts:
    'Walls and ceiling: Sherwin Williams \'\'SuperPaint\'\' interior acrylic latex paint.\nTrim and doors: Sherwin Williams "Emerald Urethane Enamel" Acrylic enamel paint.\nThe price includes the paint, labor and materials',
  totalColors: '',
  totalCoats:  '',
}

export interface InteriorEstimateDraft {
  clientName:  string
  address:     string
  options:     RoomOption[]
  photoUrls:   string[]
  scope:       InteriorScopeFields
}

export interface OptionOverview {
  wallLength:         number
  wallSurfaceArea:    number
  ceilingSurfaceArea: number
  ceilingPerimeter:   number | null
  baseboardLength:    number
  numberOfDoors:      number
  numberOfDoorFrames: number
  numberOfWindows:    number
  miscLinearFeet:     number
  miscSquareFeet:     number
  miscHourly:         number
  other:              number
}

export function computeOverview(option: RoomOption): OptionOverview {
  let wallLength = 0
  let wallSurfaceArea = 0

  for (const section of option.walls) {
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const h = m.height === '' ? 0 : m.height
      wallLength      += l
      wallSurfaceArea += l * h
    }
  }

  let ceilingSurfaceArea = 0

  for (const section of option.ceilings) {
    for (const m of section.measurements) {
      const l = m.length === '' ? 0 : m.length
      const w = m.width  === '' ? 0 : m.width
      ceilingSurfaceArea += l * w
    }
  }

  const baseboardLength = option.baseboards.reduce(
    (sum, s) => sum + s.measurements.reduce((s2, m) => s2 + (m.length === '' ? 0 : m.length), 0), 0
  )

  const numberOfDoors      = option.doors.reduce((sum, d) => sum + (d.count === '' ? 0 : d.count), 0)
  const numberOfDoorFrames = option.doorFrames.reduce((sum, d) => sum + (d.count === '' ? 0 : d.count), 0)
  const numberOfWindows    = option.windows.reduce((sum, w) => sum + (w.count === '' ? 0 : w.count), 0)

  return {
    wallLength,
    wallSurfaceArea,
    ceilingSurfaceArea,
    ceilingPerimeter: option.ceilingPerimeter === '' ? null : option.ceilingPerimeter,
    baseboardLength,
    numberOfDoors,
    numberOfDoorFrames,
    numberOfWindows,
    miscLinearFeet: option.miscLinearFeetEntries.reduce((s, e) => s + (e.linearFeet === '' ? 0 : e.linearFeet), 0),
    miscSquareFeet: option.miscSquareFeetEntries.reduce((s, e) => s + (e.squareFeet === '' ? 0 : e.squareFeet), 0),
    miscHourly:     option.miscHourlyEntries.reduce((s, e) => s + (e.units === '' ? 0 : e.units), 0),
    other: option.otherEntries.reduce((sum, e) => sum + (e.hours === '' ? 0 : e.hours), 0),
  }
}
