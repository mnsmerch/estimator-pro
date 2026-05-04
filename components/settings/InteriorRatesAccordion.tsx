'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_INTERIOR_RATES } from '@/lib/defaultSettings'
import type { InteriorProductionRates, WallTypeRate, DoorBaseRate, MiscTrimRate } from '@/types/interiorSettings'

// ── Rate metadata ─────────────────────────────────────────────────────────────

const PREP_WORK = [
  { key: 'maskingFlooring',            label: 'Masking Flooring'                                        },
  { key: 'tapeLineCaulking',           label: 'Tape Line with Caulking'                                 },
  { key: 'tapeLine',                   label: 'Tape Line'                                               },
  { key: 'prepNewBaseboards',          label: 'Prep for Newly Installed Baseboards (Puttying & Caulking)'},
  { key: 'smoothWallsPrimeNewDrywall', label: 'Smooth Walls — Prime New Drywall'                        },
  { key: 'texturedPrimeNewDrywall',    label: 'Textured — Prime New Drywall'                            },
  { key: 'handCutSameColor',           label: 'Hand Cut Line Same Color (Walls to Ceiling)'             },
  { key: 'handCutChangeColor',         label: 'Hand Cut Line Change Color (Walls to Ceiling)'           },
  { key: 'caulkingBaseboards',         label: 'Caulking in Baseboards'                                  },
]

const WALL_TYPES = [
  { key: 'texturedSameColor',       label: 'Textured Walls — Same Color'                  },
  { key: 'texturedChangeColor',     label: 'Textured Walls — Change Color'                },
  { key: 'smoothSameColor',         label: 'Smooth Walls — Same Color'                    },
  { key: 'smoothChangeColor',       label: 'Smooth Walls — Change Color'                  },
  { key: 'primeNewTexturedDrywall', label: 'Prime & Paint New Textured Drywall'           },
  { key: 'primeNewSmoothDrywall',   label: 'Prime & Paint New Smooth Drywall'             },
  { key: 'primeAndPaintDarkWalls',  label: 'Prime & Paint Dark Walls'                     },
]

const CEILING_BASE = [
  { key: 'texturedSameColor',        label: 'Textured Ceiling — Same Color'                              },
  { key: 'texturedChangeColor',      label: 'Textured Ceiling — Change Color'                            },
  { key: 'texturedVaultedSameColor', label: 'Textured Vaulted or >18ft — Same Color'                    },
  { key: 'texturedVaultedChangeColor',label:'Textured Vaulted or >18ft — Change Color'                  },
  { key: 'smoothSameColor',          label: 'Smooth Ceiling — Same Color'                               },
  { key: 'smoothChangeColor',        label: 'Smooth Ceiling — Change Color'                             },
  { key: 'smoothVaultedSameColor',   label: 'Smooth Vaulted or >18ft — Same Color'                     },
  { key: 'smoothVaultedChangeColor', label: 'Smooth Vaulted or >18ft — Change Color'                   },
  { key: 'popcornSameColor',         label: 'Popcorn Ceiling — Same Color'                              },
  { key: 'popcornChangeColor',       label: 'Popcorn Ceiling — Change Color'                            },
  { key: 'popcornVaultedSameColor',  label: 'Popcorn Vaulted or >18ft — Same Color'                    },
  { key: 'popcornVaultedChangeColor',label: 'Popcorn Vaulted or >18ft — Change Color'                  },
]

// harmonic-style formula used in the original spreadsheet: a*b/(a+b)
function derivedCeilingRate(a: number, b: number): number {
  if (a + b === 0) return 0
  return (a * b) / (a + b)
}

const DOOR_BASE_ROWS: { key: keyof ReturnType<typeof defaultDoorTypes>; label: string }[] = [
  { key: 'doors1Side',               label: 'Doors — 1 Side'                                            },
  { key: 'doorsBothSides',           label: 'Doors — Both Sides'                                        },
  { key: 'closet1Side',              label: 'Closet Doors — 1 Side'                                     },
  { key: 'closetBothSides',          label: 'Closet Doors — Both Sides'                                 },
  { key: 'commercialSteelBothSides', label: 'Commercial Steel Doors — Both Sides'                       },
  { key: 'stainNewDoorsBothSides',   label: 'Stain New Doors Both Sides (light sand + stain + clear coat)'},
  { key: 'stainOldDoorsBothSides',   label: 'Stain Old Doors Both Sides (full sand + stain + clear coat)'},
]
function defaultDoorTypes() {
  return {
    doors1Side:               { hours: 1,    lnft: 55  },
    doorsBothSides:           { hours: 1.2,  lnft: 110 },
    closet1Side:              { hours: 1.2,  lnft: 110 },
    closetBothSides:          { hours: 2,    lnft: 220 },
    commercialSteelBothSides: { hours: 2.75, lnft: 110 },
    stainNewDoorsBothSides:   { hours: 6,    lnft: 110 },
    stainOldDoorsBothSides:   { hours: 10,   lnft: 110 },
  }
}

function buildDerivedDoors(base: Record<string, DoorBaseRate>) {
  const d1    = base.doors1Side               ?? { hours: 1,    lnft: 55  }
  const d2    = base.doorsBothSides           ?? { hours: 1.2,  lnft: 110 }
  const c1    = base.closet1Side              ?? { hours: 1.2,  lnft: 110 }
  const c2    = base.closetBothSides          ?? { hours: 2,    lnft: 220 }
  const cs2   = base.commercialSteelBothSides ?? { hours: 2.75, lnft: 110 }
  const cs1h  = cs2.hours / 2

  return [
    { label: 'Commercial Steel Doors — 1 Side',                  hours: cs1h,           lnft: 55  },
    { label: 'Same Color Doors — 1 Side',                        hours: d1.hours  * 0.75, lnft: 55  },
    { label: 'Same Color Doors — Both Sides',                    hours: d2.hours  * 0.75, lnft: 110 },
    { label: 'Same Color Closet Doors — 1 Side',                 hours: c1.hours  * 0.75, lnft: 110 },
    { label: 'Same Color Closet Doors — Both Sides',             hours: c2.hours  * 0.75, lnft: 220 },
    { label: 'Same Color Commercial Steel Doors — 1 Side',       hours: cs1h      * 0.75, lnft: 55  },
    { label: 'Same Color Commercial Steel Doors — Both Sides',   hours: cs2.hours * 0.75, lnft: 110 },
    { label: 'Stain to Paint (full sand) Doors — 1 Side',        hours: d1.hours  * 2.5,  lnft: 55  },
    { label: 'Stain to Paint (full sand) Doors — Both Sides',    hours: d2.hours  * 2.5,  lnft: 110 },
    { label: 'Stain to Paint (full sand) Closet — 1 Side',       hours: c1.hours  * 2.5,  lnft: 110 },
    { label: 'Stain to Paint (full sand) Closet — Both Sides',   hours: c2.hours  * 2.5,  lnft: 220 },
    { label: 'Prime & 2 Coats of Paint Doors — 1 Side',          hours: d1.hours  * 1.2,  lnft: 55  },
    { label: 'Prime & 2 Coats of Paint Doors — Both Sides',      hours: d2.hours  * 1.2,  lnft: 110 },
  ]
}

const DOOR_FRAME_BASE_ROWS: { key: string; label: string }[] = [
  { key: 'dfDoor1Side',                label: 'DF Door — 1 Side'                  },
  { key: 'dfDoorBothSides',            label: 'DF Door — Both Sides'              },
  { key: 'dfCommercialSteel1Side',     label: 'DF Commercial Steel — 1 Side'      },
  { key: 'dfCommercialSteelBothSides', label: 'DF Commercial Steel — Both Sides'  },
]

function buildDerivedDoorFrames(base: Record<string, DoorBaseRate>) {
  const d1  = base.dfDoor1Side                ?? { hours: 0.5, lnft: 17  }
  const d2  = base.dfDoorBothSides            ?? { hours: 1,   lnft: 34  }
  const cs1 = base.dfCommercialSteel1Side     ?? { hours: 1,   lnft: 55  }
  const cs2 = base.dfCommercialSteelBothSides ?? { hours: 2,   lnft: 110 }

  const closetBothH = d2.hours * (20 / 17)
  const closet1H    = closetBothH / 2

  return [
    { label: 'DF Closet — 1 Side',                                       hours: closet1H,           lnft: 20  },
    { label: 'DF Closet — Both Sides',                                    hours: closetBothH,        lnft: 40  },
    { label: 'DF Door Same Color — 1 Side',                               hours: d1.hours  * 0.75,   lnft: 17  },
    { label: 'DF Door Same Color — Both Sides',                           hours: d2.hours  * 0.75,   lnft: 34  },
    { label: 'DF Same Color Closet — 1 Side',                             hours: closet1H  * 0.75,   lnft: 20  },
    { label: 'DF Same Color Closet — Both Sides',                         hours: closetBothH * 0.75, lnft: 40  },
    { label: 'DF Same Color Commercial Steel — 1 Side',                   hours: cs1.hours * 0.75,   lnft: 55  },
    { label: 'DF Same Color Commercial Steel — Both Sides',               hours: cs2.hours * 0.75,   lnft: 110 },
    { label: 'DF Stain to Paint (full sand) Door — 1 Side',               hours: d1.hours  * 2.5,    lnft: 17  },
    { label: 'DF Stain to Paint (full sand) Door — Both Sides',           hours: d2.hours  * 2.5,    lnft: 34  },
    { label: 'DF Stain to Paint (full sand) Closet — 1 Side',             hours: closet1H  * 2.5,    lnft: 20  },
    { label: 'DF Stain to Paint (full sand) Closet — Both Sides',         hours: closetBothH * 2.5,  lnft: 40  },
    { label: 'DF Prime & 2 Coats of Paint Doors — 1 Side',                hours: d1.hours  * 1.2,    lnft: 17  },
    { label: 'DF Prime & 2 Coats of Paint Doors — Both Sides',            hours: d2.hours  * 1.2,    lnft: 34  },
  ]
}

const WINDOW_BASE_ROWS: { key: string; label: string }[] = [
  { key: 'vinylNoTrim',         label: 'Vinyl Window — No Trim'                        },
  { key: 'vinylSillTrim',       label: 'Vinyl Window w/ Sill Trim (1 Side)'            },
  { key: 'vinylTrim4Sides',     label: 'Vinyl Window w/ Trim (4 Sides)'                },
  { key: 'woodNoTrim',          label: 'Wood Window — No Trim'                         },
  { key: 'woodDontOpen',        label: 'Wood Window — Does Not Open'                   },
  { key: 'woodOpens',           label: 'Wood Window — Opens'                           },
  { key: 'twoToneWoodDontOpen', label: '2-Tone Wood Window — Does Not Open'            },
  { key: 'twoToneWoodOpens',    label: '2-Tone Wood Window — Opens'                    },
]

function buildDerivedWindows(base: Record<string, DoorBaseRate>) {
  const s2 = base.vinylNoTrim         ?? { hours: 0.125, lnft: 0  }
  const s3 = base.vinylSillTrim       ?? { hours: 0.17,  lnft: 4  }
  const s4 = base.vinylTrim4Sides     ?? { hours: 1,     lnft: 16 }
  const s5 = base.woodNoTrim          ?? { hours: 0.25,  lnft: 0  }
  const s6 = base.woodDontOpen        ?? { hours: 1.25,  lnft: 16 }
  const s7 = base.woodOpens           ?? { hours: 1.75,  lnft: 20 }
  const s8 = base.twoToneWoodDontOpen ?? { hours: 1.75,  lnft: 32 }
  const s9 = base.twoToneWoodOpens    ?? { hours: 2.25,  lnft: 36 }

  return [
    // Same Color (×0.75) — all 8 base rows
    { label: 'Same Color Vinyl Window — No Trim',               hours: s2.hours * 0.75, lnft: 0  },
    { label: 'Same Color Vinyl Window w/ Sill Trim (1 Side)',   hours: s3.hours * 0.75, lnft: 4  },
    { label: 'Same Color Vinyl Window w/ Trim (4 Sides)',       hours: s4.hours * 0.75, lnft: 16 },
    { label: 'Same Color Wood Window — No Trim',                hours: s5.hours * 0.75, lnft: 0  },
    { label: 'Same Color Wood Window — Does Not Open',          hours: s6.hours * 0.75, lnft: 16 },
    { label: 'Same Color Wood Window — Opens',                  hours: s7.hours * 0.75, lnft: 20 },
    { label: 'Same Color 2-Tone Wood Window — Does Not Open',   hours: s8.hours * 0.75, lnft: 32 },
    { label: 'Same Color 2-Tone Wood Window — Opens',           hours: s9.hours * 0.75, lnft: 36 },
    // Stain to Paint (×2.5) — S3–S9 (no "no trim vinyl")
    { label: 'Stain to Paint (full sand) Vinyl w/ Sill Trim',   hours: s3.hours * 2.5,  lnft: 4  },
    { label: 'Stain to Paint (full sand) Vinyl w/ Trim 4 Sides',hours: s4.hours * 2.5,  lnft: 16 },
    { label: 'Stain to Paint (full sand) Wood — No Trim',       hours: s5.hours * 2.5,  lnft: 0  },
    { label: 'Stain to Paint (full sand) Wood — Does Not Open', hours: s6.hours * 2.5,  lnft: 16 },
    { label: 'Stain to Paint (full sand) Wood — Opens',         hours: s7.hours * 2.5,  lnft: 20 },
    { label: 'Stain to Paint (full sand) 2-Tone — Does Not Open',hours: s8.hours * 2.5, lnft: 32 },
    { label: 'Stain to Paint (full sand) 2-Tone — Opens',       hours: s9.hours * 2.5,  lnft: 36 },
    // Prime & 2 Coats (×1.2) — S3–S9
    { label: 'Prime & 2 Coats Vinyl w/ Sill Trim',              hours: s3.hours * 1.2,  lnft: 4  },
    { label: 'Prime & 2 Coats Vinyl w/ Trim (4 Sides)',         hours: s4.hours * 1.2,  lnft: 16 },
    { label: 'Prime & 2 Coats Wood — No Trim',                  hours: s5.hours * 1.2,  lnft: 0  },
    { label: 'Prime & 2 Coats Wood — Does Not Open',            hours: s6.hours * 1.2,  lnft: 16 },
    { label: 'Prime & 2 Coats Wood — Opens',                    hours: s7.hours * 1.2,  lnft: 20 },
    { label: 'Prime & 2 Coats 2-Tone Wood — Does Not Open',     hours: s8.hours * 1.2,  lnft: 32 },
    { label: 'Prime & 2 Coats 2-Tone Wood — Opens',             hours: s9.hours * 1.2,  lnft: 36 },
  ]
}

const MISC_HOURLY_ROWS = [
  { key: 'moveFurniture',           label: 'Move Furniture'                                       },
  { key: 'stairRisers',             label: 'Stair Risers (count each riser)'                      },
  { key: 'stainTopaintStairRisers', label: 'Stain to Paint Stair Risers (count each riser)'       },
  { key: 'railingsSpindlesOnly',    label: 'Railings — Paint Spindles Only (count each spindle)'  },
]

const MISC_SQFT_BASE = [
  { key: 'shelves',      label: 'Shelves'                    },
  { key: 'fixPatchHole', label: 'Fix / Patch Hole in Drywall' },
]

const SAME_COLOR_OPTIONS = [
  { key: 'wallsCeilingsWithPrep',    label: 'Walls & Ceilings — Same Color w/ Prep'          },
  { key: 'wallsCeilingsSprayedPrep', label: 'Walls & Ceilings — One Color Sprayed incl. Prep' },
]

const MISC_TRIM_ROWS: { key: string; label: string; section?: string }[] = [
  { key: 'otherTrimSameColor',          label: 'Other Trim — Same Color',                              section: 'Trim' },
  { key: 'otherTrimChangeColor',        label: 'Other Trim — Change Color'                             },
  { key: 'otherTrimStainToPaint',       label: 'Other Trim — Stain to Paint (full sand)'               },
  { key: 'otherTrimPrime2Coats',        label: 'Other Trim — Prime & 2 Coats'                         },
  { key: 'accentWallLineCutting',       label: 'Accent Walls — Line Cutting',                          section: 'Accent' },
  { key: 'railingsPainted',             label: 'Railings — Painted',                                   section: 'Railings' },
  { key: 'railings2Colors',             label: 'Railings — 2 Different Colors'                         },
  { key: 'railingsHandRailFooterPost',  label: 'Railings — Hand Rail + Footer + Post Only'             },
  { key: 'railingsPrime2CoatsHandRail', label: 'Railings — Prime & 2 Coats (Hand Rail + Footer + Post)'},
  { key: 'railingsPrime2Coats',         label: 'Railings — Prime & 2 Coats'                           },
  { key: 'railingsPrime2Coats2Colors',  label: 'Railings — Prime & 2 Coats, 2 Colors'                 },
  { key: 'railingsStainToPaint',        label: 'Railings — Stain to Paint (full sand)'                 },
  { key: 'railingsStainToPaint2Colors', label: 'Railings — Stain to Paint (full sand), 2 Colors'      },
  { key: 'stairStringerSameColor',      label: 'Stair Stringers — Same Color',                         section: 'Stair Stringers' },
  { key: 'stairStringerChangeColor',    label: 'Stair Stringers — Change Color'                        },
  { key: 'stairStringerStainToPaint',   label: 'Stair Stringers — Stain to Paint (full sand)'         },
  { key: 'stairStringerNew',            label: 'Stair Stringers — New (never been painted)'            },
  { key: 'stairStringerPrime2Coats',    label: 'Stair Stringers — Prime & 2 Coats'                    },
  { key: 'replaceBaseboards',           label: 'Replace Baseboards ($/lnft)',                          section: 'Replacement' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteriorRatesAccordion() {
  const [rates, setRates]   = useState<InteriorProductionRates>(DEFAULT_INTERIOR_RATES)
  const [open, setOpen]     = useState<Record<string, boolean>>({ prepWork: true })
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    getSettingsDoc<InteriorProductionRates>('interiorRates', DEFAULT_INTERIOR_RATES)
      .then(r => setRates(r))
      .finally(() => setStatus('idle'))
  }, [])

  function setRate(category: keyof InteriorProductionRates, key: string, value: number) {
    setRates(prev => ({
      ...prev,
      [category]: { ...(prev[category] as Record<string, number>), [key]: value },
    }))
  }

  function setWallRate(key: string, field: keyof WallTypeRate, value: number) {
    setRates(prev => ({
      ...prev,
      wallTypes: {
        ...prev.wallTypes,
        [key]: { ...(prev.wallTypes[key] ?? { sqftPerHr: 0, handCut: 0 }), [field]: value },
      },
    }))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await saveSettingsDoc('interiorRates', rates)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  function toggle(key: string) {
    setOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const wallTypes      = rates.wallTypes      ?? {}
  const ceilingTypes   = rates.ceilingTypes   ?? {}
  const doorTypes      = rates.doorTypes      ?? {}
  const doorFrameTypes = rates.doorFrameTypes ?? {}
  const windowTypes    = rates.windowTypes    ?? {}
  const miscTrimTypes  = rates.miscTrimTypes  ?? {}

  function setDoorRate(key: string, field: keyof DoorBaseRate, value: number) {
    setRates(prev => ({
      ...prev,
      doorTypes: {
        ...prev.doorTypes,
        [key]: { ...(prev.doorTypes[key] ?? { hours: 0, lnft: 0 }), [field]: value },
      },
    }))
  }

  function setDoorFrameRate(key: string, field: keyof DoorBaseRate, value: number) {
    setRates(prev => ({
      ...prev,
      doorFrameTypes: {
        ...prev.doorFrameTypes,
        [key]: { ...(prev.doorFrameTypes[key] ?? { hours: 0, lnft: 0 }), [field]: value },
      },
    }))
  }

  function setWindowRate(key: string, field: keyof DoorBaseRate, value: number) {
    setRates(prev => ({
      ...prev,
      windowTypes: {
        ...prev.windowTypes,
        [key]: { ...(prev.windowTypes[key] ?? { hours: 0, lnft: 0 }), [field]: value },
      },
    }))
  }

  function setMiscTrimRate(key: string, field: keyof MiscTrimRate, value: number) {
    setRates(prev => ({
      ...prev,
      miscTrimTypes: {
        ...prev.miscTrimTypes,
        [key]: { ...(prev.miscTrimTypes[key] ?? { lnftPerHr: 0, paint: 0 }), [field]: value },
      },
    }))
  }

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">All rates in ln/sq ft per hour unless noted.</p>

      <Accordion label="Prep Work" open={!!open.prepWork} onToggle={() => toggle('prepWork')}>
        <RateTable
          items={PREP_WORK}
          values={rates.prepWork}
          unit="ln/sq/hr"
          onChange={(key, v) => setRate('prepWork', key, v)}
        />
      </Accordion>

      <Accordion label="Wall Types" open={!!open.wallTypes} onToggle={() => toggle('wallTypes')}>
        <WallTypeTable
          items={WALL_TYPES}
          values={wallTypes}
          onChange={setWallRate}
        />
      </Accordion>

      <Accordion label="Ceiling Types" open={!!open.ceilingTypes} onToggle={() => toggle('ceilingTypes')}>
        <CeilingTable
          values={ceilingTypes}
          onChange={(key, v) => setRate('ceilingTypes', key, v)}
        />
      </Accordion>

      <Accordion label="Door Types" open={!!open.doorTypes} onToggle={() => toggle('doorTypes')}>
        <DoorTable values={doorTypes} onChange={setDoorRate} />
      </Accordion>

      <Accordion label="Door Frame Types" open={!!open.doorFrameTypes} onToggle={() => toggle('doorFrameTypes')}>
        <DoorFrameTable values={doorFrameTypes} onChange={setDoorFrameRate} />
      </Accordion>

      <Accordion label="Window Types" open={!!open.windowTypes} onToggle={() => toggle('windowTypes')}>
        <WindowTypeTable values={windowTypes} onChange={setWindowRate} />
      </Accordion>

      <Accordion label="Misc Linear Feet" open={!!open.miscTrimTypes} onToggle={() => toggle('miscTrimTypes')}>
        <MiscTrimTable values={miscTrimTypes} onChange={setMiscTrimRate} />
      </Accordion>

      <Accordion label="Misc Sq Ft" open={!!open.miscSqftTypes} onToggle={() => toggle('miscSqftTypes')}>
        <MiscSqftTable
          values={rates.miscSqftTypes ?? {}}
          onChange={(key, v) => setRate('miscSqftTypes', key, v)}
        />
      </Accordion>

      <Accordion label="Same Color Options" open={!!open.sameColorOptions} onToggle={() => toggle('sameColorOptions')}>
        <RateTable
          items={SAME_COLOR_OPTIONS}
          values={rates.sameColorOptions ?? {}}
          unit="SqFt/Hr"
          onChange={(key, v) => setRate('sameColorOptions', key, v)}
        />
      </Accordion>

      <Accordion label="Misc Hourly" open={!!open.miscHourlyTypes} onToggle={() => toggle('miscHourlyTypes')}>
        <MiscHourlyTable
          values={rates.miscHourlyTypes ?? {}}
          onChange={(key, v) => setRate('miscHourlyTypes', key, v)}
        />
      </Accordion>

      {/* More categories will be added here */}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save Rates'}
        </button>
        {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Accordion({ label, open, onToggle, children }: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="divide-y divide-gray-100">{children}</div>}
    </div>
  )
}

function RateTable({ items, values, unit, onChange }: {
  items:    { key: string; label: string }[]
  values:   Record<string, number>
  unit:     string
  onChange: (key: string, value: number) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Description</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">{unit}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map((item, i) => (
          <tr key={item.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
            <td className="px-5 py-2.5 text-gray-700">{item.label}</td>
            <td className="px-4 py-2 text-right">
              <input
                type="number"
                step="1"
                min="0"
                value={values[item.key] ?? 0}
                onChange={e => onChange(item.key, parseFloat(e.target.value) || 0)}
                className="w-28 px-3 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CeilingTable({ values, onChange }: {
  values:   Record<string, number>
  onChange: (key: string, value: number) => void
}) {
  const c = values

  const derived = [
    {
      label: 'Prime & Paint New Textured Drywall',
      value: derivedCeilingRate(c.texturedSameColor ?? 175, c.texturedChangeColor ?? 100),
    },
    {
      label: 'Prime & Paint New Textured Drywall — Vaulted or >18ft',
      value: derivedCeilingRate(c.texturedVaultedSameColor ?? 100, c.texturedVaultedChangeColor ?? 50),
    },
    {
      label: 'Prime & Paint New Smooth Drywall',
      value: derivedCeilingRate(c.smoothSameColor ?? 100, c.smoothChangeColor ?? 50),
    },
    {
      label: 'Prime & Paint New Smooth Drywall — Vaulted or >18ft',
      value: derivedCeilingRate(c.smoothVaultedSameColor ?? 75, c.smoothVaultedChangeColor ?? 50),
    },
  ]

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Ceiling Type</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">SqFt/Hr</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {CEILING_BASE.map((item, i) => (
          <tr key={item.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
            <td className="px-5 py-2.5 text-gray-700">{item.label}</td>
            <td className="px-4 py-2 text-right">
              <input
                type="number" step="1" min="0"
                value={values[item.key] ?? 0}
                onChange={e => onChange(item.key, parseFloat(e.target.value) || 0)}
                className="w-28 px-3 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </td>
          </tr>
        ))}
        {/* Divider */}
        <tr><td colSpan={2} className="px-5 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Calculated — Prime &amp; Paint Rates</td></tr>
        {derived.map((row, i) => (
          <tr key={i} className="bg-gray-50/60">
            <td className="px-5 py-2.5 text-gray-600 italic">{row.label}</td>
            <td className="px-4 py-2 text-right">
              <div className="w-28 ml-auto px-3 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">
                {row.value.toFixed(2)}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DoorTable({ values, onChange }: {
  values:   Record<string, DoorBaseRate>
  onChange: (key: string, field: keyof DoorBaseRate, value: number) => void
}) {
  const derived = buildDerivedDoors(values)

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Door Type</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">Hours</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">LnFt</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {DOOR_BASE_ROWS.map((row, i) => {
          const val = values[row.key] ?? { hours: 0, lnft: 0 }
          return (
            <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              <td className="px-5 py-2.5 text-gray-700">{row.label}</td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="0.01" min="0" value={val.hours}
                  onChange={e => onChange(row.key, 'hours', parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="1" min="0" value={val.lnft}
                  onChange={e => onChange(row.key, 'lnft', parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
            </tr>
          )
        })}
        <tr><td colSpan={3} className="px-5 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Calculated</td></tr>
        {derived.map((row, i) => (
          <tr key={i} className="bg-gray-50/60">
            <td className="px-5 py-2.5 text-gray-600 italic">{row.label}</td>
            <td className="px-4 py-2 text-right">
              <div className="w-24 ml-auto px-2 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">{row.hours.toFixed(2)}</div>
            </td>
            <td className="px-4 py-2 text-right">
              <div className="w-24 ml-auto px-2 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">{row.lnft}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MiscHourlyTable({ values, onChange }: {
  values:   Record<string, number>
  onChange: (key: string, value: number) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Description</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">Hrs / Unit</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">Units / Hr</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {MISC_HOURLY_ROWS.map((item, i) => {
          const hrsPerUnit = values[item.key] ?? 0
          const unitsPerHr = hrsPerUnit > 0 ? 1 / hrsPerUnit : 0
          return (
            <tr key={item.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              <td className="px-5 py-2.5 text-gray-700">{item.label}</td>
              <td className="px-4 py-2 text-right">
                <input
                  type="number" step="0.0001" min="0"
                  value={hrsPerUnit}
                  onChange={e => onChange(item.key, parseFloat(e.target.value) || 0)}
                  className="w-28 px-3 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <div className="w-28 ml-auto px-3 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">
                  {unitsPerHr.toFixed(4).replace(/\.?0+$/, '')}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MiscSqftTable({ values, onChange }: {
  values:   Record<string, number>
  onChange: (key: string, value: number) => void
}) {
  const sameColorShelves = (values.shelves ?? 75) * 0.75

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Description</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">SqFt/Hr</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {MISC_SQFT_BASE.map((item, i) => (
          <tr key={item.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
            <td className="px-5 py-2.5 text-gray-700">{item.label}</td>
            <td className="px-4 py-2 text-right">
              <input
                type="number" step="0.01" min="0"
                value={values[item.key] ?? 0}
                onChange={e => onChange(item.key, parseFloat(e.target.value) || 0)}
                className="w-28 px-3 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </td>
          </tr>
        ))}
        <tr><td colSpan={2} className="px-5 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Calculated</td></tr>
        <tr className="bg-gray-50/60">
          <td className="px-5 py-2.5 text-gray-600 italic">Same Color Shelves (×0.75)</td>
          <td className="px-4 py-2 text-right">
            <div className="w-28 ml-auto px-3 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">
              {sameColorShelves.toFixed(2)}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function MiscTrimTable({ values, onChange }: {
  values:   Record<string, MiscTrimRate>
  onChange: (key: string, field: keyof MiscTrimRate, value: number) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Description</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">LnFt/Hr</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-28">Paint</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {MISC_TRIM_ROWS.map((row, i) => {
          const val = values[row.key] ?? { lnftPerHr: 0, paint: 0 }
          return (
            <>
              {row.section && (
                <tr key={`section-${row.key}`}>
                  <td colSpan={3} className="px-5 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">{row.section}</td>
                </tr>
              )}
              <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                <td className="px-5 py-2.5 text-gray-700">{row.label}</td>
                <td className="px-4 py-2 text-right">
                  <input type="number" step="0.001" min="0" value={val.lnftPerHr}
                    onChange={e => onChange(row.key, 'lnftPerHr', parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input type="number" step="1" min="0" value={val.paint}
                    onChange={e => onChange(row.key, 'paint', parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </td>
              </tr>
            </>
          )
        })}
      </tbody>
    </table>
  )
}

function WindowTypeTable({ values, onChange }: {
  values:   Record<string, DoorBaseRate>
  onChange: (key: string, field: keyof DoorBaseRate, value: number) => void
}) {
  const derived = buildDerivedWindows(values)
  const sameColor  = derived.slice(0, 8)
  const stain      = derived.slice(8, 15)
  const prime      = derived.slice(15)

  function DerivedSection({ label, rows }: { label: string; rows: typeof derived }) {
    return (
      <>
        <tr><td colSpan={3} className="px-5 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</td></tr>
        {rows.map((row, i) => (
          <tr key={i} className="bg-gray-50/60">
            <td className="px-5 py-2.5 text-gray-600 italic">{row.label}</td>
            <td className="px-4 py-2 text-right">
              <div className="w-24 ml-auto px-2 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">{row.hours.toFixed(3)}</div>
            </td>
            <td className="px-4 py-2 text-right">
              <div className="w-24 ml-auto px-2 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">{row.lnft}</div>
            </td>
          </tr>
        ))}
      </>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Window Type</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">Hours</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">LnFt</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {WINDOW_BASE_ROWS.map((row, i) => {
          const val = values[row.key] ?? { hours: 0, lnft: 0 }
          return (
            <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              <td className="px-5 py-2.5 text-gray-700">{row.label}</td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="0.001" min="0" value={val.hours}
                  onChange={e => onChange(row.key, 'hours', parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="1" min="0" value={val.lnft}
                  onChange={e => onChange(row.key, 'lnft', parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
            </tr>
          )
        })}
        <DerivedSection label="Auto-Calculated — Same Color (×0.75)" rows={sameColor} />
        <DerivedSection label="Auto-Calculated — Stain to Paint (×2.5)" rows={stain} />
        <DerivedSection label="Auto-Calculated — Prime & 2 Coats (×1.2)" rows={prime} />
      </tbody>
    </table>
  )
}

function DoorFrameTable({ values, onChange }: {
  values:   Record<string, DoorBaseRate>
  onChange: (key: string, field: keyof DoorBaseRate, value: number) => void
}) {
  const derived = buildDerivedDoorFrames(values)

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Door Frame Type</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">Hours</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">LnFt</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {DOOR_FRAME_BASE_ROWS.map((row, i) => {
          const val = values[row.key] ?? { hours: 0, lnft: 0 }
          return (
            <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              <td className="px-5 py-2.5 text-gray-700">{row.label}</td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="0.01" min="0" value={val.hours}
                  onChange={e => onChange(row.key, 'hours', parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="1" min="0" value={val.lnft}
                  onChange={e => onChange(row.key, 'lnft', parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
            </tr>
          )
        })}
        <tr><td colSpan={3} className="px-5 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Calculated</td></tr>
        {derived.map((row, i) => (
          <tr key={i} className="bg-gray-50/60">
            <td className="px-5 py-2.5 text-gray-600 italic">{row.label}</td>
            <td className="px-4 py-2 text-right">
              <div className="w-24 ml-auto px-2 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">{row.hours.toFixed(2)}</div>
            </td>
            <td className="px-4 py-2 text-right">
              <div className="w-24 ml-auto px-2 py-1 text-right text-sm bg-gray-100 text-gray-700 font-semibold rounded-md">{row.lnft}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WallTypeTable({ items, values, onChange }: {
  items:    { key: string; label: string }[]
  values:   Record<string, WallTypeRate>
  onChange: (key: string, field: keyof WallTypeRate, value: number) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-white border-b border-gray-100">
          <th className="text-left px-5 py-2.5 font-medium text-gray-500">Wall Type</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">SqFt/Hr</th>
          <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-36">Hand Cut</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map((item, i) => {
          const row = values[item.key] ?? { sqftPerHr: 0, handCut: 0 }
          return (
            <tr key={item.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              <td className="px-5 py-2.5 text-gray-700">{item.label}</td>
              <td className="px-4 py-2 text-right">
                <input
                  type="number" step="0.01" min="0"
                  value={row.sqftPerHr}
                  onChange={e => onChange(item.key, 'sqftPerHr', parseFloat(e.target.value) || 0)}
                  className="w-28 px-3 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <input
                  type="number" step="1" min="0"
                  value={row.handCut}
                  onChange={e => onChange(item.key, 'handCut', parseFloat(e.target.value) || 0)}
                  className="w-28 px-3 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
