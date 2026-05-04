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

export interface InteriorEstimateDraft {
  clientName: string
  address:    string
  options:    RoomOption[]
  photoUrls:  string[]
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
