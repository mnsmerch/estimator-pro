// ── Cabinet Estimate Types ───────────────────────────────────────────────────

export interface LargePanelEntry {
  id:              string
  doorEquivalents: number | ''
}

export interface CabinetCustomItem {
  id:          string
  description: string
  price:       number
}

// Sum custom add-on items — only counts items with a description and a positive
// price, so the live form total matches what's rendered on the proposal.
export function sumCabinetCustomItems(items?: CabinetCustomItem[]): number {
  if (!items?.length) return 0
  return items.reduce((s, i) => s + (i.description?.trim() && i.price > 0 ? i.price : 0), 0)
}

export interface CabinetScopeFields {
  projectDescription: string
  prepWork:           string
  paintProcess:       string
  finalTouches:       string
  paintProducts:      string
}

export const CABINET_SCOPE_DEFAULTS: CabinetScopeFields = {
  projectDescription:
    '- Prep and paint all cabinet doors and drawer fronts\n- Prep and paint all cabinet frames/boxes\n- Paint all crown molding and trim on cabinets\n- Reinstall all doors and drawers',
  prepWork:
    '• Remove all cabinet doors and drawer fronts\n• Label doors and drawers for proper reinstallation\n• Clean all surfaces thoroughly to remove grease, oils, and grime\n• Lightly sand all surfaces for proper adhesion\n• Fill any holes, cracks, or imperfections with wood filler\n• Sand smooth after filling\n• Wipe down all surfaces to remove dust and debris\n• Tape off countertops, appliances, and surrounding areas',
  paintProcess:
    '• Apply shellac-based primer to all surfaces for maximum adhesion\n• Spray 2 coats of Sherwin Williams Emerald Urethane Enamel using a Fine-Finish Paint Sprayer\n• Sand lightly between coats with fine-grit sandpaper\n• Allow proper dry time between coats\n• Quality control inspection of all surfaces',
  finalTouches:
    '• Re-hang all cabinet doors\n• Re-install all drawer fronts\n• Re-install all hardware\n• Quality check all doors open and close properly\n• Touch up any areas as needed\n• Clean up all work areas\n• Final walkthrough with homeowner\n• Balance due upon completion',
  paintProducts:
    'Sherwin Williams "Emerald Urethane Enamel" Acrylic enamel paint.\nThe price includes the paint, labor, and materials.',
}

export interface CabinetEstimateDraft {
  clientName:     string
  address:        string
  clientPhone?:   string
  clientEmail?:   string
  salesTaxRate?:  number | null

  // Cabinet items
  doors:          number | ''
  drawers:        number | ''
  panelsDoorSize: number | ''    // panels that are 1 door-equivalent each ($100)
  largePanels:    LargePanelEntry[] // each has N door-equivalents ($100 × N)

  // Options
  twoTone:        boolean   // +$300 flat
  patchHoles:     boolean   // +$15 per door or drawer
  aquaCoat:       boolean   // +$45 per door or drawer (2 coats AquaCoat grain filler)

  // Scope of work
  scope:          CabinetScopeFields

  // Photos
  photoUrls:      string[]
  photoNotes?:    string[]   // index-matched notes for each photo

  // Optional notes
  notes?:         string

  // Custom price add-ons (description + dollar amount)
  customItems?:   CabinetCustomItem[]

  // Estimator-only manual override of the pre-tax subtotal (null = use calculated)
  subtotalOverride?: number | null
}

// ── Pricing constants ────────────────────────────────────────────────────────

export const CABINET_PRICING = {
  perDoor:           125,
  perDrawer:         105,
  perPanelDoorEquiv: 100,
  twoTone:           300,
  perPatchDrill:      15,
  perAquaCoat:        45,
  minimum:          4995,
} as const

// ── Calculation ───────────────────────────────────────────────────────────────

export interface CabinetBreakdown {
  doors:          number   // count
  drawers:        number   // count
  totalPanelEquivs: number

  doorsTotal:      number
  drawersTotal:    number
  panelsTotal:     number
  twoToneTotal:    number
  patchHolesTotal: number
  aquaCoatTotal:   number
  subtotal:        number
  total:           number  // max(subtotal, minimum) if subtotal > 0
  minimumApplied:  boolean
}

export function calculateCabinet(draft: CabinetEstimateDraft): CabinetBreakdown {
  const doors   = draft.doors   === '' ? 0 : draft.doors
  const drawers = draft.drawers === '' ? 0 : draft.drawers

  const panelsDoorSize   = draft.panelsDoorSize === '' ? 0 : draft.panelsDoorSize
  const largePanelEquivs = draft.largePanels.reduce(
    (sum, p) => sum + (p.doorEquivalents === '' ? 0 : p.doorEquivalents), 0
  )
  const totalPanelEquivs = panelsDoorSize + largePanelEquivs

  const doorsTotal      = doors   * CABINET_PRICING.perDoor
  const drawersTotal    = drawers * CABINET_PRICING.perDrawer
  const panelsTotal     = totalPanelEquivs * CABINET_PRICING.perPanelDoorEquiv
  const twoToneTotal    = draft.twoTone    ? CABINET_PRICING.twoTone     : 0
  const patchHolesTotal = draft.patchHoles ? (doors + drawers) * CABINET_PRICING.perPatchDrill : 0
  const aquaCoatTotal   = draft.aquaCoat   ? (doors + drawers) * CABINET_PRICING.perAquaCoat   : 0

  const subtotal = doorsTotal + drawersTotal + panelsTotal + twoToneTotal + patchHolesTotal + aquaCoatTotal
  const minimumApplied = subtotal > 0 && subtotal < CABINET_PRICING.minimum
  const total = subtotal > 0 ? Math.max(subtotal, CABINET_PRICING.minimum) : 0

  return {
    doors, drawers, totalPanelEquivs,
    doorsTotal, drawersTotal, panelsTotal,
    twoToneTotal, patchHolesTotal, aquaCoatTotal,
    subtotal, total, minimumApplied,
  }
}
