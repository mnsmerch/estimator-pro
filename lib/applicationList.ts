import type { ProductionRates, TrimRate, StainingRateItem } from '@/types/settings'

export interface ApplicationMeta {
  key: string
  categoryKey: string
  categoryLabel: string
  label: string
  unitLabel: string
  isAccent?: boolean
  isBodyColor?: boolean
  isTrimColor?: boolean
  isDownspout?: boolean
  /**
   * For doors and sidelights only: the lnFt portion that represents the door/sidelight
   * face (takes the item's color — accent, trim, or body). The remainder
   * (trimLnFt − faceLnFt) is the trim frame, which always takes trim color.
   * When faceLnFt === trimLnFt there is no frame, so the row is single-bucket.
   */
  faceLnFt?: number
}

export interface ApplicationItem extends ApplicationMeta {
  /** Globally unique key — `${categoryKey}.${key}` — used in EstimateRow.applicationKey */
  uniqueKey: string
  rate: number
  converter: number
  trimLnFt: number
  surfaceAreaFactor: number
}

// Static metadata — labels, categories, flags
const APP_META: ApplicationMeta[] = [
  // ── Prep Work ─────────────────────────────────────────────
  { key: 'powerWash',           categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Power Wash',                              unitLabel: 'SqFt' },
  { key: 'scrapeOneBoard',      categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape 1 Side of Board',                  unitLabel: 'LnFt' },
  { key: 'scrapeSurface',       categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape Surface',                          unitLabel: 'SqFt' },
  { key: 'scuffSand',           categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scuff Sand',                              unitLabel: 'SqFt' },
  { key: 'lightSand',           categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Light Sand',                              unitLabel: 'SqFt' },
  { key: 'heavySand',           categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Heavy Sand',                              unitLabel: 'SqFt' },
  { key: 'primingBrushSqft',    categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Priming w/ Brush (SqFt)',                 unitLabel: 'SqFt' },
  { key: 'primingBrushLnft',    categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Priming w/ Brush (LnFt)',                 unitLabel: 'LnFt' },
  { key: 'scrapeSandPrimeLnft', categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape, Sand & Prime (LnFt)',             unitLabel: 'LnFt' },
  { key: 'ssp75to100',          categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape/Sand/Prime — 75–100% Peeling',     unitLabel: 'SqFt' },
  { key: 'ssp50to75',           categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape/Sand/Prime — 50–75% Peeling',      unitLabel: 'SqFt' },
  { key: 'ssp25to50',           categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape/Sand/Prime — 25–50% Peeling',      unitLabel: 'SqFt' },
  { key: 'ssp25orLess',         categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape/Sand/Prime — 25% or Less Peeling', unitLabel: 'SqFt' },
  { key: 'sspLocalized',        categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Scrape/Sand/Prime — Localized Failure',   unitLabel: '#'    },
  { key: 'caulking1Story',      categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Caulking — 1 Story',                      unitLabel: 'LnFt' },
  { key: 'caulking2Story',      categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Caulking — 2 Story',                      unitLabel: 'LnFt' },
  { key: 'caulking3Story',      categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Caulking — 3rd Story',                    unitLabel: 'LnFt' },
  { key: 'manualPrepHours',     categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Manual Prep Hours',                       unitLabel: 'Hrs'  },
  { key: 'miscHazardHours',     categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Misc / Hazard Hours',                     unitLabel: 'Hrs'  },
  { key: 'managerUnits',        categoryKey: 'prepWork', categoryLabel: 'Prep Work',        label: 'Manager Units',                           unitLabel: '#'    },
  // ── Body Application ──────────────────────────────────────
  { key: 'sidingSpray',               categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Siding Spray',                      unitLabel: 'SqFt' },
  { key: 'sidingSprayBackroll',        categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Siding Spray w/ Backroll',          unitLabel: 'SqFt' },
  { key: 'sidingRoll',                 categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Siding Roll',                       unitLabel: 'SqFt' },
  { key: 'masonrySpray',               categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Masonry Spray',                     unitLabel: 'SqFt' },
  { key: 'masonrySprayBackroll',       categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Masonry Spray w/ Backroll',         unitLabel: 'SqFt' },
  { key: 'masonryRoll',                categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Masonry Roll',                      unitLabel: 'SqFt' },
  { key: 'sidingBrush',                categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Siding Brush',                      unitLabel: 'SqFt' },
  { key: 'masonryBrush',               categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Masonry Brush',                     unitLabel: 'SqFt' },
  { key: 'oneCoatSidingSpray',         categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'One Coat Only Siding Spray',        unitLabel: 'SqFt' },
  { key: 'accentSidingSpray',          categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Siding Spray',               unitLabel: 'SqFt', isAccent: true },
  { key: 'accentSidingSprayBackroll',  categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Siding Spray w/ Backroll',   unitLabel: 'SqFt', isAccent: true },
  { key: 'accentSidingRoll',           categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Siding Roll',                unitLabel: 'SqFt', isAccent: true },
  { key: 'accentMasonrySpray',         categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Masonry Spray',              unitLabel: 'SqFt', isAccent: true },
  { key: 'accentMasonrySprayBackroll', categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Masonry Spray w/ Backroll',  unitLabel: 'SqFt', isAccent: true },
  { key: 'accentMasonryRoll',          categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Masonry Roll',               unitLabel: 'SqFt', isAccent: true },
  { key: 'accentSidingBrush',          categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Siding Brush',               unitLabel: 'SqFt', isAccent: true },
  { key: 'accentMasonryBrush',         categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Accent Masonry Brush',              unitLabel: 'SqFt', isAccent: true },
  { key: 'stainingShakesBackbrush',    categoryKey: 'bodyApplication', categoryLabel: 'Body Application', label: 'Staining Shakes w/ Back Brush',     unitLabel: 'SqFt' },
  // ── Eaves ─────────────────────────────────────────────────
  { key: 'eavesBodyColor',        categoryKey: 'eaves', categoryLabel: 'Eaves', label: 'Eaves — Body Color',           unitLabel: 'LnFt', isBodyColor: true },
  { key: 'eavesTrimColor',        categoryKey: 'eaves', categoryLabel: 'Eaves', label: 'Eaves — Trim Color',           unitLabel: 'LnFt', isTrimColor: true },
  { key: 'eavesSeparateColor',    categoryKey: 'eaves', categoryLabel: 'Eaves', label: 'Eaves — Separate Color',       unitLabel: 'LnFt' },
  { key: 'eaves3rdBodyColor',     categoryKey: 'eaves', categoryLabel: 'Eaves', label: '3rd Story Eaves — Body Color', unitLabel: 'LnFt', isBodyColor: true },
  { key: 'eaves3rdTrimColor',     categoryKey: 'eaves', categoryLabel: 'Eaves', label: '3rd Story Eaves — Trim Color', unitLabel: 'LnFt', isTrimColor: true },
  { key: 'eaves3rdSeparateColor', categoryKey: 'eaves', categoryLabel: 'Eaves', label: '3rd Story Eaves — Sep. Color', unitLabel: 'LnFt' },
  // ── Fascia ────────────────────────────────────────────────
  { key: 'fascia1Story', categoryKey: 'fascia', categoryLabel: 'Fascia', label: 'Fascia — 1 Story',   unitLabel: 'LnFt' },
  { key: 'fascia2Story', categoryKey: 'fascia', categoryLabel: 'Fascia', label: 'Fascia — 2 Story',   unitLabel: 'LnFt' },
  { key: 'fascia3Story', categoryKey: 'fascia', categoryLabel: 'Fascia', label: 'Fascia — 3rd Story', unitLabel: 'LnFt' },
  // ── Windows ───────────────────────────────────────────────
  { key: 'vinylNoTrim',             categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window Vinyl — No Trim',              unitLabel: 'Units' },
  { key: 'woodNoTrimBody',          categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window Wood — No Trim (Body Color)',   unitLabel: 'Units', isBodyColor: true },
  { key: 'vinylWithTrim',           categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window Vinyl — With Trim',             unitLabel: 'Units' },
  { key: 'woodDontOpen',            categoryKey: 'windows', categoryLabel: 'Windows', label: "Window Wood — Don't Open",             unitLabel: 'Units' },
  { key: 'woodOpen',                categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window Wood — Open',                   unitLabel: 'Units' },
  { key: 'threeDVinyl',             categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window 3D Vinyl',                      unitLabel: 'Units' },
  { key: 'threeDWoodDontOpen',      categoryKey: 'windows', categoryLabel: 'Windows', label: "Window 3D Wood — Don't Open",          unitLabel: 'Units' },
  { key: 'threeDWoodOpen',          categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window 3D Wood — Open',                unitLabel: 'Units' },
  { key: 'twoToneWoodDontOpen',     categoryKey: 'windows', categoryLabel: 'Windows', label: "Window 2-Tone Wood — Don't Open",      unitLabel: 'Units' },
  { key: 'twoToneWoodOpen',         categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window 2-Tone Wood — Open',            unitLabel: 'Units' },
  { key: 'threeD2ToneWoodDontOpen', categoryKey: 'windows', categoryLabel: 'Windows', label: "Window 3D 2-Tone Wood — Don't Open",   unitLabel: 'Units' },
  { key: 'threeD2ToneWoodOpen',     categoryKey: 'windows', categoryLabel: 'Windows', label: 'Window 3D 2-Tone Wood — Open',         unitLabel: 'Units' },
  // ── Other Trim ────────────────────────────────────────────
  { key: 'otherTrim1Story',           categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Other Trim — 1 Story',              unitLabel: 'LnFt' },
  { key: 'otherTrim2PlusStory',       categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Other Trim — 2+ Story',             unitLabel: 'LnFt' },
  { key: 'downspoutsPosts',           categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Downspouts / Posts (3–4 sides)',    unitLabel: 'LnFt', isDownspout: true },
  { key: 'trim3D',                    categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: '3D Trim',                           unitLabel: 'LnFt' },
  { key: 'tudorTrimFacing',           categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Tudor Trim Facing',                 unitLabel: 'LnFt' },
  { key: 'tudorTrim3D',               categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Tudor Trim 3D',                     unitLabel: 'LnFt' },
  { key: 'removeReinstallDownspouts', categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Remove & Reinstall Downspouts',     unitLabel: 'LnFt', isDownspout: true },
  { key: 'justRemoveDownspouts',      categoryKey: 'otherTrim', categoryLabel: 'Other Trim', label: 'Just Remove Downspouts',            unitLabel: 'LnFt', isDownspout: true },
  // ── Doors ─────────────────────────────────────────────────
  // faceLnFt = door face lnFt (takes the door's color); trimLnFt − faceLnFt = trim frame (trim color)
  { key: 'bodyColorNoTrim',          categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Body Color, No Trim',          unitLabel: 'Units', isBodyColor: true, faceLnFt: 0  },
  { key: 'bodyColorWithTrim',        categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Body Color, With Trim',        unitLabel: 'Units', isBodyColor: true, faceLnFt: 0  },
  { key: 'trimColorNoTrim',          categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Trim Color, No Trim',          unitLabel: 'Units', isTrimColor: true, faceLnFt: 70 },
  { key: 'trimColorWithTrim',        categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Trim Color, With Trim',        unitLabel: 'Units', isTrimColor: true, faceLnFt: 70 },
  { key: 'accentColorNoTrim',        categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Accent Color, No Trim',        unitLabel: 'Units', isAccent: true,    faceLnFt: 70 },
  { key: 'accentColorWithTrim',      categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Accent Color, With Trim',      unitLabel: 'Units', isAccent: true,    faceLnFt: 70 },
  { key: 'stainedToPaintedNoTrim',   categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Stained to Painted, No Trim',  unitLabel: 'Units', faceLnFt: 70 },
  { key: 'stainedToPaintedWithTrim', categoryKey: 'doors', categoryLabel: 'Doors', label: 'Door — Stained to Painted, With Trim',unitLabel: 'Units', faceLnFt: 70 },
  // ── Sidelights ────────────────────────────────────────────
  // faceLnFt = sidelight face lnFt; trimLnFt − faceLnFt = trim frame (trim color)
  { key: 'bodyColorNoTrim',          categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Body Color, No Trim',          unitLabel: 'Units', isBodyColor: true, faceLnFt: 0  },
  { key: 'bodyColorWithTrim',        categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Body Color, With Trim',        unitLabel: 'Units', isBodyColor: true, faceLnFt: 0  },
  { key: 'trimColorNoTrim',          categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Trim Color, No Trim',          unitLabel: 'Units', isTrimColor: true, faceLnFt: 35 },
  { key: 'trimColorWithTrim',        categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Trim Color, With Trim',        unitLabel: 'Units', isTrimColor: true, faceLnFt: 35 },
  { key: 'accentColorNoTrim',        categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Accent Color, No Trim',        unitLabel: 'Units', isAccent: true,    faceLnFt: 35 },
  { key: 'accentColorWithTrim',      categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Accent Color, With Trim',      unitLabel: 'Units', isAccent: true,    faceLnFt: 35 },
  { key: 'stainedToPaintedNoTrim',   categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Stained to Painted, No Trim',  unitLabel: 'Units', faceLnFt: 35 },
  { key: 'stainedToPaintedWithTrim', categoryKey: 'sidelights', categoryLabel: 'Sidelights', label: 'Sidelight — Stained to Painted, With Trim',unitLabel: 'Units', faceLnFt: 35 },
  // ── Garage Doors ──────────────────────────────────────────
  { key: 'singleBodyColor',          categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Single Garage — Body Color',              unitLabel: 'Units', isBodyColor: true },
  { key: 'singleBodyColorWindows',   categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Single Garage — Body Color w/ Windows',   unitLabel: 'Units', isBodyColor: true },
  { key: 'singleTrimColor',          categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Single Garage — Trim Color',              unitLabel: 'Units', isTrimColor: true },
  { key: 'singleTrimColorWindows',   categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Single Garage — Trim Color w/ Windows',   unitLabel: 'Units', isTrimColor: true },
  { key: 'singleAccentColor',        categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Single Garage — Accent Color',            unitLabel: 'Units', isAccent: true },
  { key: 'singleAccentColorWindows', categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Single Garage — Accent Color w/ Windows', unitLabel: 'Units', isAccent: true },
  { key: 'doubleBodyColor',          categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Double Garage — Body Color',              unitLabel: 'Units', isBodyColor: true },
  { key: 'doubleBodyColorWindows',   categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Double Garage — Body Color w/ Windows',   unitLabel: 'Units', isBodyColor: true },
  { key: 'doubleTrimColor',          categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Double Garage — Trim Color',              unitLabel: 'Units', isTrimColor: true },
  { key: 'doubleTrimColorWindows',   categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Double Garage — Trim Color w/ Windows',   unitLabel: 'Units', isTrimColor: true },
  { key: 'doubleAccentColor',        categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Double Garage — Accent Color',            unitLabel: 'Units', isAccent: true },
  { key: 'doubleAccentColorWindows', categoryKey: 'garageDoors', categoryLabel: 'Garage Doors', label: 'Double Garage — Accent Color w/ Windows', unitLabel: 'Units', isAccent: true },
  // ── Railings ──────────────────────────────────────────────
  { key: 'railings1Color',     categoryKey: 'railings', categoryLabel: 'Railings', label: 'Railings — 1 Color',      unitLabel: 'LnFt' },
  { key: 'railings2ColorEasy', categoryKey: 'railings', categoryLabel: 'Railings', label: 'Railings — 2 Colors Easy', unitLabel: 'LnFt' },
  { key: 'railings2ColorHard', categoryKey: 'railings', categoryLabel: 'Railings', label: 'Railings — 2 Colors Hard', unitLabel: 'LnFt' },
  // ── Shutters ──────────────────────────────────────────────
  { key: 'accentGround', categoryKey: 'shutters', categoryLabel: 'Shutters', label: 'Accent Shutters — Ground/Roof', unitLabel: 'Units', isAccent: true },
  { key: 'accentLadder', categoryKey: 'shutters', categoryLabel: 'Shutters', label: 'Accent Shutters — Ladder Only', unitLabel: 'Units', isAccent: true },
  { key: 'trimGround',   categoryKey: 'shutters', categoryLabel: 'Shutters', label: 'Trim Shutters — Ground/Roof',   unitLabel: 'Units', isTrimColor: true },
  { key: 'trimLadder',   categoryKey: 'shutters', categoryLabel: 'Shutters', label: 'Trim Shutters — Ladder Only',   unitLabel: 'Units', isTrimColor: true },
  // ── Staining ──────────────────────────────────────────────
  { key: 'deckSolidStain',      categoryKey: 'staining', categoryLabel: 'Staining', label: 'Deck Surface — Solid Stain',       unitLabel: 'SqFt' },
  { key: 'stairsSolidStain',    categoryKey: 'staining', categoryLabel: 'Staining', label: 'Stairs — Solid Stain',             unitLabel: 'Units' },
  { key: 'fenceFlatSpray',      categoryKey: 'staining', categoryLabel: 'Staining', label: 'Fence Flat Side — Spray',          unitLabel: 'LnFt' },
  { key: 'fenceBeamsSpray',     categoryKey: 'staining', categoryLabel: 'Staining', label: 'Fence Beam Side — Spray',          unitLabel: 'LnFt' },
  { key: 'fenceFlatBrushRoll',  categoryKey: 'staining', categoryLabel: 'Staining', label: 'Fence Flat Side — Brush/Roll',     unitLabel: 'LnFt' },
  { key: 'fenceBeamsBrushRoll', categoryKey: 'staining', categoryLabel: 'Staining', label: 'Fence Beam Side — Brush/Roll',     unitLabel: 'LnFt' },
  { key: 'stainRailings',       categoryKey: 'staining', categoryLabel: 'Staining', label: 'Stain Railings',                   unitLabel: 'LnFt' },
  { key: 'stainPosts',          categoryKey: 'staining', categoryLabel: 'Staining', label: 'Stain Posts',                      unitLabel: 'Units' },
  { key: 'stainTrim',           categoryKey: 'staining', categoryLabel: 'Staining', label: 'Stain Trim',                       unitLabel: 'LnFt' },
  // ── Wood Replacement ──────────────────────────────────────
  { key: 'trim1Story',           categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '1st Story Trim',                unitLabel: 'LnFt' },
  { key: 'trim2Story',           categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '2nd Story Trim',                unitLabel: 'LnFt' },
  { key: 'regularSiding1Story',  categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '1st Story Regular Siding',      unitLabel: 'LnFt' },
  { key: 'regularSiding2Story',  categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '2nd Story Regular Siding',      unitLabel: 'LnFt' },
  { key: 'cementFiber1Story',    categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '1st Story Cement Fiber (Hardie)', unitLabel: 'LnFt' },
  { key: 'cementFiber2Story',    categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '2nd Story Cement Fiber (Hardie)', unitLabel: 'LnFt' },
  { key: 'doorFrame',            categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: 'Door Frame',                    unitLabel: 'Units' },
  { key: 'fascia1Story',         categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '1st Story Fascia',              unitLabel: 'LnFt' },
  { key: 'fascia2Story',         categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '2nd Story Fascia',              unitLabel: 'LnFt' },
  { key: 'fascia1StoryGutter',   categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '1st Story Fascia w/ Gutter',    unitLabel: 'LnFt' },
  { key: 'fascia2StoryGutter',   categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '2nd Story Fascia w/ Gutter',    unitLabel: 'LnFt' },
  { key: 'railings',             categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: 'Railings',                      unitLabel: 'LnFt' },
  { key: 'eaveSoffit1Story',     categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '1st Story Eave/Soffit',         unitLabel: 'LnFt' },
  { key: 'eaveSoffit2Story',     categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: '2nd Story Eave/Soffit',         unitLabel: 'LnFt' },
  { key: 'hardieBoard',          categoryKey: 'woodReplacement', categoryLabel: 'Wood Replacement', label: 'Larger Area Hardie Siding',     unitLabel: 'SqFt' },
]

/** Build the full application list enriched with live rate data from settings */
export function buildApplicationList(rates: ProductionRates): ApplicationItem[] {
  return APP_META.map(meta => {
    const { categoryKey, key } = meta
    let rate = 0
    let trimLnFt = 0
    let surfaceAreaFactor = 0

    if (categoryKey === 'windows' || categoryKey === 'doors' ||
        categoryKey === 'sidelights' || categoryKey === 'garageDoors') {
      const cat = rates[categoryKey as keyof ProductionRates] as Record<string, TrimRate>
      const item = cat?.[key]
      rate = item?.unitsPerHr ?? 0
      trimLnFt = item?.trimLnFt ?? 0
    } else if (categoryKey === 'staining') {
      const item = rates.staining?.[key] as StainingRateItem | undefined
      rate = item?.rate ?? 0
      surfaceAreaFactor = item?.surfaceAreaFactor ?? 0
    } else {
      const cat = rates[categoryKey as keyof ProductionRates] as Record<string, number>
      rate = cat?.[key] ?? 0
    }

    return {
      ...meta,
      uniqueKey: `${meta.categoryKey}.${meta.key}`,
      rate,
      converter: rate > 0 ? 1 / rate : 0,
      trimLnFt,
      surfaceAreaFactor,
    }
  })
}

/** Unique category groups for grouped dropdown */
export const CATEGORY_ORDER = [
  'Prep Work', 'Body Application', 'Eaves', 'Fascia',
  'Windows', 'Other Trim', 'Doors', 'Sidelights',
  'Garage Doors', 'Railings', 'Shutters', 'Staining', 'Wood Replacement',
]
