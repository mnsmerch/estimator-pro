'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_INTERIOR_PAINT_PRODUCTS } from '@/lib/defaultSettings'
import { createInteriorEstimate, updateInteriorEstimate } from '@/lib/firebase/interiorEstimates'
import { uploadPhoto, deletePhoto } from '@/lib/firebase/storage'
import { calculateWallCalc } from '@/lib/interiorCalculations'
import { DEFAULT_INTERIOR_RATES, DEFAULT_INTERIOR_RULES } from '@/lib/defaultSettings'
import type { InteriorEstimateRecord } from '@/lib/firebase/interiorEstimates'
import { computeOverview } from '@/types/interiorEstimate'
import type {
  RoomOption, WallSection, WallMeasurement,
  CeilingSection, CeilingMeasurement,
  BaseboardSection, BaseboardMeasurement,
  DoorEntry, DoorFrameEntry, WindowEntry, OtherEntry,
  MiscLinearFeetEntry, MiscSquareFeetEntry, MiscHourlyEntry,
  PaintSelections, InteriorEstimateDraft, OptionOverview,
  InteriorScopeFields,
} from '@/types/interiorEstimate'
import { INTERIOR_SCOPE_DEFAULTS } from '@/types/interiorEstimate'
import type { InteriorPaintProduct } from '@/types/interiorSettings'

// ── Constants ──────────────────────────────────────────────────────────────────

const WALL_TYPE_OPTIONS = [
  { key: 'texturedSameColor',       label: 'Textured Walls — Same Color'        },
  { key: 'texturedChangeColor',     label: 'Textured Walls — Change Color'      },
  { key: 'smoothSameColor',         label: 'Smooth Walls — Same Color'          },
  { key: 'smoothChangeColor',       label: 'Smooth Walls — Change Color'        },
  { key: 'primeNewTexturedDrywall', label: 'Prime & Paint New Textured Drywall' },
  { key: 'primeNewSmoothDrywall',   label: 'Prime & Paint New Smooth Drywall'   },
  { key: 'primeAndPaintDarkWalls',  label: 'Prime & Paint Dark Walls'           },
]

const CEILING_TYPE_OPTIONS = [
  { key: 'texturedSameColor',           label: 'Textured Ceiling — Same Color'                        },
  { key: 'texturedChangeColor',         label: 'Textured Ceiling — Change Color'                      },
  { key: 'texturedVaultedSameColor',    label: 'Textured Vaulted or >18ft — Same Color'               },
  { key: 'texturedVaultedChangeColor',  label: 'Textured Vaulted or >18ft — Change Color'             },
  { key: 'smoothSameColor',             label: 'Smooth Ceiling — Same Color'                          },
  { key: 'smoothChangeColor',           label: 'Smooth Ceiling — Change Color'                        },
  { key: 'smoothVaultedSameColor',      label: 'Smooth Vaulted or >18ft — Same Color'                 },
  { key: 'smoothVaultedChangeColor',    label: 'Smooth Vaulted or >18ft — Change Color'               },
  { key: 'popcornSameColor',            label: 'Popcorn Ceiling — Same Color'                         },
  { key: 'popcornChangeColor',          label: 'Popcorn Ceiling — Change Color'                       },
  { key: 'popcornVaultedSameColor',     label: 'Popcorn Vaulted or >18ft — Same Color'                },
  { key: 'popcornVaultedChangeColor',   label: 'Popcorn Vaulted or >18ft — Change Color'              },
  { key: 'primeNewTextured',            label: 'Prime & Paint New Textured Drywall'                   },
  { key: 'primeNewTexturedVaulted',     label: 'Prime & Paint New Textured Drywall — Vaulted or >18ft'},
  { key: 'primeNewSmooth',              label: 'Prime & Paint New Smooth Drywall'                     },
  { key: 'primeNewSmoothVaulted',       label: 'Prime & Paint New Smooth Drywall — Vaulted or >18ft'  },
]

const BASEBOARD_TYPE_OPTIONS = [
  { key: 'sameColor',    label: 'Same Color'                  },
  { key: 'changeColor',  label: 'Change Color'                },
  { key: 'stainToPaint', label: 'Stain to Paint (full sand)'  },
  { key: 'prime2Coats',  label: 'Prime & 2 Coats'             },
  { key: 'newInstall',   label: 'New Installation'            },
]

const DOOR_TYPE_OPTIONS = [
  { key: 'doors1Side',                label: 'Doors — 1 Side'                                              },
  { key: 'doorsBothSides',            label: 'Doors — Both Sides'                                          },
  { key: 'closet1Side',               label: 'Closet Doors — 1 Side'                                       },
  { key: 'closetBothSides',           label: 'Closet Doors — Both Sides'                                   },
  { key: 'commercialSteelBothSides',  label: 'Commercial Steel Doors — Both Sides'                         },
  { key: 'stainNewDoorsBothSides',    label: 'Stain New Doors — Both Sides (light sand + stain + clear)'   },
  { key: 'stainOldDoorsBothSides',    label: 'Stain Old Doors — Both Sides (full sand + stain + clear)'    },
  { key: 'commercialSteel1Side',      label: 'Commercial Steel Doors — 1 Side'                             },
  { key: 'sameColorDoors1Side',       label: 'Same Color Doors — 1 Side'                                   },
  { key: 'sameColorDoorsBothSides',   label: 'Same Color Doors — Both Sides'                               },
  { key: 'sameColorCloset1Side',      label: 'Same Color Closet Doors — 1 Side'                            },
  { key: 'sameColorClosetBothSides',  label: 'Same Color Closet Doors — Both Sides'                        },
  { key: 'sameColorCSSteel1Side',     label: 'Same Color Commercial Steel — 1 Side'                        },
  { key: 'sameColorCSSteelBothSides', label: 'Same Color Commercial Steel — Both Sides'                    },
  { key: 'stainToPaint1Side',         label: 'Stain to Paint (full sand) Doors — 1 Side'                   },
  { key: 'stainToPaintBothSides',     label: 'Stain to Paint (full sand) Doors — Both Sides'               },
  { key: 'stainToPaintCloset1Side',   label: 'Stain to Paint (full sand) Closet — 1 Side'                  },
  { key: 'stainToPaintClosetBoth',    label: 'Stain to Paint (full sand) Closet — Both Sides'              },
  { key: 'prime2Coats1Side',          label: 'Prime & 2 Coats of Paint — 1 Side'                           },
  { key: 'prime2CoatsBothSides',      label: 'Prime & 2 Coats of Paint — Both Sides'                       },
]

const MAX_DOOR_TYPES = 5

const DOOR_FRAME_TYPE_OPTIONS = [
  { key: 'dfDoor1Side',                   label: 'DF Door — 1 Side'                                   },
  { key: 'dfDoorBothSides',               label: 'DF Door — Both Sides'                               },
  { key: 'dfCommercialSteel1Side',        label: 'DF Commercial Steel — 1 Side'                       },
  { key: 'dfCommercialSteelBothSides',    label: 'DF Commercial Steel — Both Sides'                   },
  { key: 'dfCloset1Side',                 label: 'DF Closet — 1 Side'                                 },
  { key: 'dfClosetBothSides',             label: 'DF Closet — Both Sides'                             },
  { key: 'dfDoorSameColor1Side',          label: 'DF Door Same Color — 1 Side'                        },
  { key: 'dfDoorSameColorBothSides',      label: 'DF Door Same Color — Both Sides'                    },
  { key: 'dfSameColorCloset1Side',        label: 'DF Same Color Closet — 1 Side'                      },
  { key: 'dfSameColorClosetBothSides',    label: 'DF Same Color Closet — Both Sides'                  },
  { key: 'dfSameColorCSSteel1Side',       label: 'DF Same Color Commercial Steel — 1 Side'            },
  { key: 'dfSameColorCSSteelBothSides',   label: 'DF Same Color Commercial Steel — Both Sides'        },
  { key: 'dfStainToPaintDoor1Side',       label: 'DF Stain to Paint (full sand) Door — 1 Side'        },
  { key: 'dfStainToPaintDoorBothSides',   label: 'DF Stain to Paint (full sand) Door — Both Sides'    },
  { key: 'dfStainToPaintCloset1Side',     label: 'DF Stain to Paint (full sand) Closet — 1 Side'      },
  { key: 'dfStainToPaintClosetBothSides', label: 'DF Stain to Paint (full sand) Closet — Both Sides'  },
  { key: 'dfPrime2Coats1Side',            label: 'DF Prime & 2 Coats of Paint — 1 Side'               },
  { key: 'dfPrime2CoatsBothSides',        label: 'DF Prime & 2 Coats of Paint — Both Sides'           },
]

const MAX_DOOR_FRAME_TYPES = 5

const WINDOW_TYPE_OPTIONS = [
  { key: 'vinylNoTrim',         label: 'Vinyl Window — No Trim'                          },
  { key: 'vinylSillTrim',       label: 'Vinyl Window w/ Sill Trim (1 Side)'              },
  { key: 'vinylTrim4Sides',     label: 'Vinyl Window w/ Trim (4 Sides)'                  },
  { key: 'woodNoTrim',          label: 'Wood Window — No Trim'                           },
  { key: 'woodDontOpen',        label: 'Wood Window — Does Not Open'                     },
  { key: 'woodOpens',           label: 'Wood Window — Opens'                             },
  { key: 'twoToneWoodDontOpen', label: '2-Tone Wood Window — Does Not Open'              },
  { key: 'twoToneWoodOpens',    label: '2-Tone Wood Window — Opens'                      },
  { key: 'scVinylNoTrim',       label: 'Same Color Vinyl — No Trim'                      },
  { key: 'scVinylSillTrim',     label: 'Same Color Vinyl w/ Sill Trim (1 Side)'          },
  { key: 'scVinylTrim4Sides',   label: 'Same Color Vinyl w/ Trim (4 Sides)'              },
  { key: 'scWoodNoTrim',        label: 'Same Color Wood — No Trim'                       },
  { key: 'scWoodDontOpen',      label: 'Same Color Wood — Does Not Open'                 },
  { key: 'scWoodOpens',         label: 'Same Color Wood — Opens'                         },
  { key: 'scTwoToneDontOpen',   label: 'Same Color 2-Tone Wood — Does Not Open'          },
  { key: 'scTwoToneOpens',      label: 'Same Color 2-Tone Wood — Opens'                  },
  { key: 'stpVinylSillTrim',    label: 'Stain to Paint (full sand) Vinyl w/ Sill Trim'   },
  { key: 'stpVinylTrim4Sides',  label: 'Stain to Paint (full sand) Vinyl w/ Trim 4 Sides'},
  { key: 'stpWoodNoTrim',       label: 'Stain to Paint (full sand) Wood — No Trim'       },
  { key: 'stpWoodDontOpen',     label: 'Stain to Paint (full sand) Wood — Does Not Open' },
  { key: 'stpWoodOpens',        label: 'Stain to Paint (full sand) Wood — Opens'         },
  { key: 'stpTwoToneDontOpen',  label: 'Stain to Paint (full sand) 2-Tone — Dont Open'   },
  { key: 'stpTwoToneOpens',     label: 'Stain to Paint (full sand) 2-Tone — Opens'       },
  { key: 'p2cVinylSillTrim',    label: 'Prime & 2 Coats Vinyl w/ Sill Trim'              },
  { key: 'p2cVinylTrim4Sides',  label: 'Prime & 2 Coats Vinyl w/ Trim (4 Sides)'         },
  { key: 'p2cWoodNoTrim',       label: 'Prime & 2 Coats Wood — No Trim'                  },
  { key: 'p2cWoodDontOpen',     label: 'Prime & 2 Coats Wood — Does Not Open'            },
  { key: 'p2cWoodOpens',        label: 'Prime & 2 Coats Wood — Opens'                    },
  { key: 'p2cTwoToneDontOpen',  label: 'Prime & 2 Coats 2-Tone Wood — Does Not Open'     },
  { key: 'p2cTwoToneOpens',     label: 'Prime & 2 Coats 2-Tone Wood — Opens'             },
]

const MAX_WINDOW_TYPES = 2

const MISC_LINEAR_FEET_OPTIONS = [
  { key: 'otherTrimSameColor',          label: 'Other Trim — Same Color'                                    },
  { key: 'otherTrimChangeColor',        label: 'Other Trim — Change Color'                                  },
  { key: 'otherTrimStainToPaint',       label: 'Other Trim — Stain to Paint (full sand)'                    },
  { key: 'otherTrimPrime2Coats',        label: 'Prime & 2 Coats — Other Trim'                               },
  { key: 'accentWallLineCutting',       label: 'Accent Walls — Line Cutting'                                },
  { key: 'railingsPainted',             label: 'Painted Railings'                                           },
  { key: 'railings2Colors',             label: 'Railings — 2 Different Colors'                              },
  { key: 'railingsHandRailFooterPost',  label: 'Railings — Hand Rail + Footer + Post Only'                  },
  { key: 'railingsPrime2CoatsHandRail', label: 'Prime & 2 Coats — Railings Hand Rail + Footer + Post Only'  },
  { key: 'railingsPrime2Coats',         label: 'Prime & 2 Coats — Railings'                                 },
  { key: 'railingsPrime2Coats2Colors',  label: 'Prime & 2 Coats — Railings 2 Different Colors'              },
  { key: 'railingsStainToPaint',        label: 'Stain to Paint (full sand) — Railings'                      },
  { key: 'railingsStainToPaint2Colors', label: 'Stain to Paint (full sand) — Railings 2 Different Colors'   },
  { key: 'stairStringerSameColor',      label: 'Stair Stringer — Same Color'                                },
  { key: 'stairStringerChangeColor',    label: 'Stair Stringer — Change Color'                              },
  { key: 'stairStringerStainToPaint',   label: 'Stain to Paint (full sand) — Stair Stringers'               },
  { key: 'stairStringerNew',            label: 'New Stair Stringers (never been painted)'                    },
  { key: 'stairStringerPrime2Coats',    label: 'Prime & 2 Coats — Stair Stringer'                           },
  { key: 'replaceBaseboards',           label: 'Replace Baseboards (price per linear foot)'                 },
]

const MISC_SQFT_OPTIONS = [
  { key: 'shelves',          label: 'Shelves'                   },
  { key: 'sameColorShelves', label: 'Same Color Shelves'        },
  { key: 'fixPatchHole',     label: 'Fix/Patch Hole in Drywall' },
]

const MISC_HOURLY_OPTIONS = [
  { key: 'moveFurniture',           label: 'Move Furniture'                                       },
  { key: 'stairRisers',             label: 'Stair Risers (count each stair riser)'                },
  { key: 'stainTopaintStairRisers', label: 'Stain to Paint Stair Risers (count each stair riser)' },
  { key: 'railingsSpindlesOnly',    label: 'Railings Paint Spindles Only (count each spindle)'    },
]

const PAINT_TYPES: { key: keyof PaintSelections; label: string }[] = [
  { key: 'wall',    label: 'Wall Paint'    },
  { key: 'ceiling', label: 'Ceiling Paint' },
  { key: 'trim',    label: 'Trim Paint'    },
  { key: 'misc',    label: 'Misc Paint'    },
  { key: 'other',   label: 'Other Paint'   },
]

const DEFAULT_PAINTS: PaintSelections = {
  wall:    'int-sw-super-paint-flat',
  ceiling: 'int-sw-super-paint-flat',
  trim:    'int-sw-emerald-ute-semi-gloss',
  misc:    'int-no-paint',
  other:   'int-sw-super-paint-flat',
}

const OVERVIEW_ROWS: { key: keyof OptionOverview; label: string }[] = [
  { key: 'wallLength',         label: 'Wall Length'        },
  { key: 'wallSurfaceArea',    label: 'Wall Surface Area'  },
  { key: 'ceilingSurfaceArea', label: 'Ceiling Surface'    },
  { key: 'ceilingPerimeter',   label: 'Ceiling Perimeter'  },
  { key: 'baseboardLength',    label: 'Baseboard Length'   },
  { key: 'numberOfDoors',      label: 'Number of Doors'    },
  { key: 'numberOfDoorFrames', label: 'Number of DFs'      },
  { key: 'numberOfWindows',    label: 'Number of Windows'  },
  { key: 'miscLinearFeet',     label: 'Misc Linear Feet'   },
  { key: 'miscSquareFeet',     label: 'Misc Square Feet'   },
  { key: 'miscHourly',         label: 'Misc Hourly'        },
  { key: 'other',              label: 'Other'              },
]

// ── ID helper ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ── Factory functions ──────────────────────────────────────────────────────────

function newWallMeasurement(): WallMeasurement   { return { id: uid(), length: '', height: '' } }
function newWallSection(): WallSection           { return { id: uid(), wallType: '', measurements: [newWallMeasurement()] } }
function newCeilingMeasurement(): CeilingMeasurement { return { id: uid(), length: '', width: '' } }
function newCeilingSection(): CeilingSection     { return { id: uid(), ceilingType: '', measurements: [newCeilingMeasurement()] } }
function newBaseboardMeasurement(): BaseboardMeasurement { return { id: uid(), length: '' } }
function newBaseboardSection(): BaseboardSection { return { id: uid(), baseboardType: '', measurements: [newBaseboardMeasurement()] } }
function newDoorEntry(): DoorEntry               { return { id: uid(), doorType: '', count: '' } }
function newDoorFrameEntry(): DoorFrameEntry     { return { id: uid(), doorFrameType: '', count: '' } }
function newWindowEntry(): WindowEntry           { return { id: uid(), windowType: '', count: '' } }
function newOtherEntry(): OtherEntry             { return { id: uid(), description: '', hours: '', gallons: '' } }
function newMiscLinearFeetEntry(): MiscLinearFeetEntry { return { id: uid(), miscTrimType: '', linearFeet: '' } }
function newMiscSquareFeetEntry(): MiscSquareFeetEntry { return { id: uid(), miscSqftType: '', squareFeet: '' } }
function newMiscHourlyEntry(): MiscHourlyEntry   { return { id: uid(), miscHourlyType: '', units: '' } }

function newOption(name = ''): RoomOption {
  return {
    id: uid(), name, coats: 2, paints: { ...DEFAULT_PAINTS },
    walls: [newWallSection()], ceilings: [newCeilingSection()],
    baseboards: [newBaseboardSection()], doors: [newDoorEntry()],
    doorFrames: [newDoorFrameEntry()], windows: [newWindowEntry()],
    ceilingPerimeter: '',
    miscLinearFeetEntries: [newMiscLinearFeetEntry()],
    miscSquareFeetEntries: [newMiscSquareFeetEntry()],
    miscHourlyEntries:     [newMiscHourlyEntry()],
    otherEntries:          [newOtherEntry()],
  }
}

function recordToDraft(r: InteriorEstimateRecord): InteriorEstimateDraft {
  return {
    clientName: r.clientName,
    address:    r.address,
    options:    r.options,
    photoUrls:  r.photoUrls ?? [],
    scope:      r.scope     ?? { ...INTERIOR_SCOPE_DEFAULTS },
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteriorEstimateForm({
  estimateId,
  initialRecord,
}: {
  estimateId?:    string
  initialRecord?: InteriorEstimateRecord
}) {
  const router  = useRouter()
  const { user } = useAuth()

  const firstOpt = initialRecord ? initialRecord.options[0] : newOption('Room 1')

  const [draft, setDraft]       = useState<InteriorEstimateDraft>(() =>
    initialRecord ? recordToDraft(initialRecord) : { clientName: '', address: '', options: [firstOpt], photoUrls: [], scope: { ...INTERIOR_SCOPE_DEFAULTS } }
  )
  const [activeId, setActiveId] = useState<string>(firstOpt?.id ?? '')
  const [products, setProducts] = useState<InteriorPaintProduct[]>(DEFAULT_INTERIOR_PAINT_PRODUCTS)
  const [rules, setRules]       = useState(DEFAULT_INTERIOR_RULES)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [uploadError, setUploadError]         = useState<string | null>(null)

  useEffect(() => {
    getSettingsDoc<{ items: InteriorPaintProduct[] }>('interiorPaintProducts', { items: DEFAULT_INTERIOR_PAINT_PRODUCTS })
      .then(d => setProducts(d.items))
      .catch(() => {})
    getSettingsDoc('interiorBusinessRules', DEFAULT_INTERIOR_RULES)
      .then(d => setRules(d))
      .catch(() => {})
  }, [])

  const activeOption = draft.options.find(o => o.id === activeId) ?? draft.options[0]

  // ── Draft updaters ───────────────────────────────────────────────────────────

  function patchOption(optId: string, patch: Partial<RoomOption>) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id === optId ? { ...o, ...patch } : o) }))
  }

  function patchPaint(optId: string, key: keyof PaintSelections, value: string) {
    setDraft(prev => ({
      ...prev,
      options: prev.options.map(o => o.id === optId ? { ...o, paints: { ...o.paints, [key]: value } } : o),
    }))
  }

  function addOption() {
    const opt = newOption(`Room ${draft.options.length + 1}`)
    setDraft(prev => ({ ...prev, options: [...prev.options, opt] }))
    setActiveId(opt.id)
  }

  function removeOption(id: string) {
    const remaining = draft.options.filter(o => o.id !== id)
    if (remaining.length === 0) return
    setDraft(prev => ({ ...prev, options: remaining }))
    if (activeId === id) setActiveId(remaining[0].id)
  }

  // ── Wall updaters ────────────────────────────────────────────────────────────

  function addWallSection(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, walls: [...o.walls, newWallSection()] }) }))
  }
  function removeWallSection(optId: string, sid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, walls: o.walls.length > 1 ? o.walls.filter(s => s.id !== sid) : o.walls }) }))
  }
  function setWallType(optId: string, sid: string, wallType: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, walls: o.walls.map(s => s.id !== sid ? s : { ...s, wallType }) }) }))
  }
  function addWallRow(optId: string, sid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, walls: o.walls.map(s => s.id !== sid ? s : { ...s, measurements: [...s.measurements, newWallMeasurement()] }) }) }))
  }
  function removeWallRow(optId: string, sid: string, mid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, walls: o.walls.map(s => s.id !== sid ? s : { ...s, measurements: s.measurements.length > 1 ? s.measurements.filter(m => m.id !== mid) : s.measurements }) }) }))
  }
  function patchWallRow(optId: string, sid: string, mid: string, field: 'length' | 'height', raw: string) {
    const value = raw === '' ? '' : parseFloat(raw) || 0
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, walls: o.walls.map(s => s.id !== sid ? s : { ...s, measurements: s.measurements.map(m => m.id !== mid ? m : { ...m, [field]: value }) }) }) }))
  }

  // ── Ceiling updaters ─────────────────────────────────────────────────────────

  function addCeilingSection(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, ceilings: [...o.ceilings, newCeilingSection()] }) }))
  }
  function removeCeilingSection(optId: string, sid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, ceilings: o.ceilings.length > 1 ? o.ceilings.filter(s => s.id !== sid) : o.ceilings }) }))
  }
  function setCeilingType(optId: string, sid: string, ceilingType: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, ceilings: o.ceilings.map(s => s.id !== sid ? s : { ...s, ceilingType }) }) }))
  }
  function addCeilingRow(optId: string, sid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, ceilings: o.ceilings.map(s => s.id !== sid ? s : { ...s, measurements: [...s.measurements, newCeilingMeasurement()] }) }) }))
  }
  function removeCeilingRow(optId: string, sid: string, mid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, ceilings: o.ceilings.map(s => s.id !== sid ? s : { ...s, measurements: s.measurements.length > 1 ? s.measurements.filter(m => m.id !== mid) : s.measurements }) }) }))
  }
  function patchCeilingRow(optId: string, sid: string, mid: string, field: 'length' | 'width', raw: string) {
    const value = raw === '' ? '' : parseFloat(raw) || 0
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, ceilings: o.ceilings.map(s => s.id !== sid ? s : { ...s, measurements: s.measurements.map(m => m.id !== mid ? m : { ...m, [field]: value }) }) }) }))
  }

  // ── Baseboard updaters ───────────────────────────────────────────────────────

  function addBaseboardSection(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, baseboards: [...o.baseboards, newBaseboardSection()] }) }))
  }
  function removeBaseboardSection(optId: string, sid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, baseboards: o.baseboards.length > 1 ? o.baseboards.filter(s => s.id !== sid) : o.baseboards }) }))
  }
  function setBaseboardType(optId: string, sid: string, baseboardType: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, baseboards: o.baseboards.map(s => s.id !== sid ? s : { ...s, baseboardType }) }) }))
  }
  function addBaseboardRow(optId: string, sid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, baseboards: o.baseboards.map(s => s.id !== sid ? s : { ...s, measurements: [...s.measurements, newBaseboardMeasurement()] }) }) }))
  }
  function removeBaseboardRow(optId: string, sid: string, mid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, baseboards: o.baseboards.map(s => s.id !== sid ? s : { ...s, measurements: s.measurements.length > 1 ? s.measurements.filter(m => m.id !== mid) : s.measurements }) }) }))
  }
  function patchBaseboardRow(optId: string, sid: string, mid: string, raw: string) {
    const value = raw === '' ? '' : parseFloat(raw) || 0
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, baseboards: o.baseboards.map(s => s.id !== sid ? s : { ...s, measurements: s.measurements.map(m => m.id !== mid ? m : { ...m, length: value }) }) }) }))
  }

  // ── Door updaters ────────────────────────────────────────────────────────────

  function addDoorEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId || o.doors.length >= MAX_DOOR_TYPES ? o : { ...o, doors: [...o.doors, newDoorEntry()] }) }))
  }
  function removeDoorEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, doors: o.doors.length > 1 ? o.doors.filter(d => d.id !== eid) : o.doors }) }))
  }
  function patchDoorEntry(optId: string, eid: string, field: keyof DoorEntry, value: string | number | '') {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, doors: o.doors.map(d => d.id !== eid ? d : { ...d, [field]: value }) }) }))
  }

  // ── Door frame updaters ──────────────────────────────────────────────────────

  function addDoorFrameEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId || o.doorFrames.length >= MAX_DOOR_FRAME_TYPES ? o : { ...o, doorFrames: [...o.doorFrames, newDoorFrameEntry()] }) }))
  }
  function removeDoorFrameEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, doorFrames: o.doorFrames.length > 1 ? o.doorFrames.filter(d => d.id !== eid) : o.doorFrames }) }))
  }
  function patchDoorFrameEntry(optId: string, eid: string, field: keyof DoorFrameEntry, value: string | number | '') {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, doorFrames: o.doorFrames.map(d => d.id !== eid ? d : { ...d, [field]: value }) }) }))
  }

  // ── Window updaters ──────────────────────────────────────────────────────────

  function addWindowEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId || o.windows.length >= MAX_WINDOW_TYPES ? o : { ...o, windows: [...o.windows, newWindowEntry()] }) }))
  }
  function removeWindowEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, windows: o.windows.length > 1 ? o.windows.filter(w => w.id !== eid) : o.windows }) }))
  }
  function patchWindowEntry(optId: string, eid: string, field: keyof WindowEntry, value: string | number | '') {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, windows: o.windows.map(w => w.id !== eid ? w : { ...w, [field]: value }) }) }))
  }

  // ── Misc linear feet updaters ────────────────────────────────────────────────

  function addMiscLinearFeetEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscLinearFeetEntries: [...o.miscLinearFeetEntries, newMiscLinearFeetEntry()] }) }))
  }
  function removeMiscLinearFeetEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscLinearFeetEntries: o.miscLinearFeetEntries.length > 1 ? o.miscLinearFeetEntries.filter(e => e.id !== eid) : o.miscLinearFeetEntries }) }))
  }
  function patchMiscLinearFeetEntry(optId: string, eid: string, patch: Partial<MiscLinearFeetEntry>) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscLinearFeetEntries: o.miscLinearFeetEntries.map(e => e.id !== eid ? e : { ...e, ...patch }) }) }))
  }

  // ── Misc square feet updaters ─────────────────────────────────────────────────

  function addMiscSquareFeetEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscSquareFeetEntries: [...o.miscSquareFeetEntries, newMiscSquareFeetEntry()] }) }))
  }
  function removeMiscSquareFeetEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscSquareFeetEntries: o.miscSquareFeetEntries.length > 1 ? o.miscSquareFeetEntries.filter(e => e.id !== eid) : o.miscSquareFeetEntries }) }))
  }
  function patchMiscSquareFeetEntry(optId: string, eid: string, patch: Partial<MiscSquareFeetEntry>) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscSquareFeetEntries: o.miscSquareFeetEntries.map(e => e.id !== eid ? e : { ...e, ...patch }) }) }))
  }

  // ── Misc hourly updaters ──────────────────────────────────────────────────────

  function addMiscHourlyEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscHourlyEntries: [...o.miscHourlyEntries, newMiscHourlyEntry()] }) }))
  }
  function removeMiscHourlyEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscHourlyEntries: o.miscHourlyEntries.length > 1 ? o.miscHourlyEntries.filter(e => e.id !== eid) : o.miscHourlyEntries }) }))
  }
  function patchMiscHourlyEntry(optId: string, eid: string, patch: Partial<MiscHourlyEntry>) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, miscHourlyEntries: o.miscHourlyEntries.map(e => e.id !== eid ? e : { ...e, ...patch }) }) }))
  }

  // ── Other entry updaters ─────────────────────────────────────────────────────

  function addOtherEntry(optId: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, otherEntries: [...o.otherEntries, newOtherEntry()] }) }))
  }
  function removeOtherEntry(optId: string, eid: string) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, otherEntries: o.otherEntries.length > 1 ? o.otherEntries.filter(e => e.id !== eid) : o.otherEntries }) }))
  }
  function patchOtherEntry(optId: string, eid: string, patch: Partial<OtherEntry>) {
    setDraft(prev => ({ ...prev, options: prev.options.map(o => o.id !== optId ? o : { ...o, otherEntries: o.otherEntries.map(e => e.id !== eid ? e : { ...e, ...patch }) }) }))
  }

  // ── Photo handlers ───────────────────────────────────────────────────────────

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return
    const remaining = 20 - draft.photoUrls.length
    const files = Array.from(e.target.files).slice(0, remaining)
    if (!files.length) return
    setUploadingPhotos(true)
    setUploadError(null)
    try {
      const urls = await Promise.all(files.map(f => uploadPhoto(user.uid, f)))
      setDraft(prev => ({ ...prev, photoUrls: [...prev.photoUrls, ...urls].slice(0, 20) }))
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingPhotos(false)
      e.target.value = ''
    }
  }

  async function handleRemovePhoto(url: string) {
    setDraft(prev => ({ ...prev, photoUrls: prev.photoUrls.filter(u => u !== url) }))
    await deletePhoto(url)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!draft.clientName.trim() || !user) return
    setSaving(true)
    try {
      if (estimateId) {
        await updateInteriorEstimate(estimateId, draft)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const newId = await createInteriorEstimate(draft, user.uid)
        router.push(`/estimates/interior/${newId}/edit`)
      }
    } catch {
      // leave saving=true so button stays disabled — surface error if needed
    } finally {
      setSaving(false)
    }
  }

  const overview  = computeOverview(activeOption)
  const wallCalc  = calculateWallCalc(activeOption, DEFAULT_INTERIOR_RATES, products, rules)
  const isEditing = !!estimateId

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
        </div>
        <nav className="flex items-center gap-5">
          <a href="/dashboard" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Dashboard</a>
          <a href="/estimates" className="text-sm text-brand-600 font-semibold transition-colors">Estimates</a>
          <a href="/contracts" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Contracts</a>
          <a href="/settings"  className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Settings</a>
        </nav>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Page title + client info */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {isEditing ? 'Edit Interior Estimate' : 'New Interior Estimate'}
          </h1>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
              <input
                type="text" placeholder="e.g. John Smith"
                value={draft.clientName}
                onChange={e => setDraft(prev => ({ ...prev, clientName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text" placeholder="e.g. 123 Main St, Seattle WA"
                value={draft.address}
                onChange={e => setDraft(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Option tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {draft.options.map(opt => (
            <div key={opt.id} className="flex items-center">
              <button
                onClick={() => setActiveId(opt.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  opt.id === activeId
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'
                }`}
              >
                {opt.name || 'Unnamed Room'}
              </button>
              {draft.options.length > 1 && (
                <button onClick={() => removeOption(opt.id)} className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addOption}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-brand-600 border border-dashed border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Option
          </button>
        </div>

        {/* Option editor */}
        <div className="flex gap-6 items-start">

          {/* ── Left: form ───────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Room name + Coats */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Room / Area Name</label>
                <input
                  type="text" placeholder="e.g. Master Bedroom"
                  value={activeOption.name}
                  onChange={e => patchOption(activeOption.id, { name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="w-28">
                <label className="block text-sm font-medium text-gray-700 mb-1">Coats</label>
                <input
                  type="number" min="1" max="5" step="1"
                  value={activeOption.coats}
                  onChange={e => patchOption(activeOption.id, { coats: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Materials */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Materials</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-2 font-medium text-gray-500 w-36">Type</th>
                    <th className="text-left px-5 py-2 font-medium text-gray-500">Product</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PAINT_TYPES.map((pt, i) => (
                    <tr key={pt.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-5 py-2.5 text-gray-700 font-medium">{pt.label}</td>
                      <td className="px-5 py-2">
                        <select
                          value={activeOption.paints[pt.key]}
                          onChange={e => patchPaint(activeOption.id, pt.key, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                        >
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Walls ─────────────────────────────────────────────────────── */}
            <SectionHeader label="Walls" />
            {activeOption.walls.map((section, si) => (
              <MeasurementCard
                key={section.id} label="Wall Type" index={si}
                selectedType={section.wallType} typeOptions={WALL_TYPE_OPTIONS} typePlaceholder="Select wall type…"
                col1Label="Length (ft)" col2Label="Height (ft)"
                measurements={section.measurements.map(m => ({ id: m.id, a: m.length, b: m.height }))}
                canDelete={activeOption.walls.length > 1}
                onTypeChange={wt => setWallType(activeOption.id, section.id, wt)}
                onDelete={() => removeWallSection(activeOption.id, section.id)}
                onAddRow={() => addWallRow(activeOption.id, section.id)}
                onRemoveRow={mid => removeWallRow(activeOption.id, section.id, mid)}
                onPatchRow={(mid, field, val) => patchWallRow(activeOption.id, section.id, mid, field === 'a' ? 'length' : 'height', val)}
              />
            ))}
            <AddButton label="Add Wall Type" onClick={() => addWallSection(activeOption.id)} />

            {/* ── Ceilings ──────────────────────────────────────────────────── */}
            <SectionHeader label="Ceilings" />
            {activeOption.ceilings.map((section, si) => (
              <MeasurementCard
                key={section.id} label="Ceiling Type" index={si}
                selectedType={section.ceilingType} typeOptions={CEILING_TYPE_OPTIONS} typePlaceholder="Select ceiling type…"
                col1Label="Length (ft)" col2Label="Width (ft)"
                measurements={section.measurements.map(m => ({ id: m.id, a: m.length, b: m.width }))}
                canDelete={activeOption.ceilings.length > 1}
                onTypeChange={ct => setCeilingType(activeOption.id, section.id, ct)}
                onDelete={() => removeCeilingSection(activeOption.id, section.id)}
                onAddRow={() => addCeilingRow(activeOption.id, section.id)}
                onRemoveRow={mid => removeCeilingRow(activeOption.id, section.id, mid)}
                onPatchRow={(mid, field, val) => patchCeilingRow(activeOption.id, section.id, mid, field === 'a' ? 'length' : 'width', val)}
              />
            ))}
            <AddButton label="Add Ceiling Type" onClick={() => addCeilingSection(activeOption.id)} />

            {/* Ceiling-only: perimeter */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">For Ceilings Only — Option</p>
              <div className="w-48">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ceiling Perimeter (ft)</label>
                <input
                  type="number" step="0.1" min="0" placeholder="e.g. 20"
                  value={activeOption.ceilingPerimeter}
                  onChange={e => {
                    const raw = e.target.value
                    patchOption(activeOption.id, { ceilingPerimeter: raw === '' ? '' : parseFloat(raw) || 0 })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* ── Baseboards ───────────────────────────────────────────────── */}
            <SectionHeader label="Baseboards" />
            {activeOption.baseboards.map((section, si) => (
              <LengthOnlyCard
                key={section.id} label="Baseboard Type" index={si}
                selectedType={section.baseboardType} typeOptions={BASEBOARD_TYPE_OPTIONS} typePlaceholder="Select baseboard type…"
                measurements={section.measurements.map(m => ({ id: m.id, value: m.length }))}
                canDelete={activeOption.baseboards.length > 1}
                onTypeChange={t => setBaseboardType(activeOption.id, section.id, t)}
                onDelete={() => removeBaseboardSection(activeOption.id, section.id)}
                onAddRow={() => addBaseboardRow(activeOption.id, section.id)}
                onRemoveRow={mid => removeBaseboardRow(activeOption.id, section.id, mid)}
                onPatchRow={(mid, val) => patchBaseboardRow(activeOption.id, section.id, mid, val)}
              />
            ))}
            <AddButton label="Add Baseboard Type" onClick={() => addBaseboardSection(activeOption.id)} />

            {/* ── Doors ────────────────────────────────────────────────────── */}
            <SectionHeader label="Doors" />
            <CountCard
              label="Door Types" typeOptions={DOOR_TYPE_OPTIONS} typePlaceholder="Select door type…"
              entries={activeOption.doors.map(d => ({ id: d.id, type: d.doorType, count: d.count }))}
              max={MAX_DOOR_TYPES}
              onAdd={() => addDoorEntry(activeOption.id)}
              onRemove={eid => removeDoorEntry(activeOption.id, eid)}
              onTypeChange={(eid, v) => patchDoorEntry(activeOption.id, eid, 'doorType', v)}
              onCountChange={(eid, v) => patchDoorEntry(activeOption.id, eid, 'count', v)}
            />

            {/* ── Door Frames ───────────────────────────────────────────────── */}
            <SectionHeader label="Door Frames" />
            <CountCard
              label="Door Frame Types" typeOptions={DOOR_FRAME_TYPE_OPTIONS} typePlaceholder="Select door frame type…"
              entries={activeOption.doorFrames.map(d => ({ id: d.id, type: d.doorFrameType, count: d.count }))}
              max={MAX_DOOR_FRAME_TYPES}
              onAdd={() => addDoorFrameEntry(activeOption.id)}
              onRemove={eid => removeDoorFrameEntry(activeOption.id, eid)}
              onTypeChange={(eid, v) => patchDoorFrameEntry(activeOption.id, eid, 'doorFrameType', v)}
              onCountChange={(eid, v) => patchDoorFrameEntry(activeOption.id, eid, 'count', v)}
            />

            {/* ── Windows ──────────────────────────────────────────────────── */}
            <SectionHeader label="Windows" />
            <CountCard
              label="Window Types" typeOptions={WINDOW_TYPE_OPTIONS} typePlaceholder="Select window type…"
              entries={activeOption.windows.map(w => ({ id: w.id, type: w.windowType, count: w.count }))}
              max={MAX_WINDOW_TYPES}
              onAdd={() => addWindowEntry(activeOption.id)}
              onRemove={eid => removeWindowEntry(activeOption.id, eid)}
              onTypeChange={(eid, v) => patchWindowEntry(activeOption.id, eid, 'windowType', v)}
              onCountChange={(eid, v) => patchWindowEntry(activeOption.id, eid, 'count', v)}
            />

            {/* ── Misc Linear Feet ─────────────────────────────────────────── */}
            <SectionHeader label="Misc Linear Feet" />
            <TypeValueTable
              colLabel="Linear Feet" options={MISC_LINEAR_FEET_OPTIONS}
              entries={activeOption.miscLinearFeetEntries.map(e => ({ id: e.id, type: e.miscTrimType, value: e.linearFeet }))}
              onAdd={() => addMiscLinearFeetEntry(activeOption.id)}
              onRemove={eid => removeMiscLinearFeetEntry(activeOption.id, eid)}
              onTypeChange={(eid, v) => patchMiscLinearFeetEntry(activeOption.id, eid, { miscTrimType: v })}
              onValueChange={(eid, raw) => patchMiscLinearFeetEntry(activeOption.id, eid, { linearFeet: raw === '' ? '' : parseFloat(raw) || 0 })}
            />

            {/* ── Misc Square Feet ─────────────────────────────────────────── */}
            <SectionHeader label="Misc Square Feet" />
            <TypeValueTable
              colLabel="Square Feet" options={MISC_SQFT_OPTIONS}
              entries={activeOption.miscSquareFeetEntries.map(e => ({ id: e.id, type: e.miscSqftType, value: e.squareFeet }))}
              onAdd={() => addMiscSquareFeetEntry(activeOption.id)}
              onRemove={eid => removeMiscSquareFeetEntry(activeOption.id, eid)}
              onTypeChange={(eid, v) => patchMiscSquareFeetEntry(activeOption.id, eid, { miscSqftType: v })}
              onValueChange={(eid, raw) => patchMiscSquareFeetEntry(activeOption.id, eid, { squareFeet: raw === '' ? '' : parseFloat(raw) || 0 })}
            />

            {/* ── Misc Hourly ──────────────────────────────────────────────── */}
            <SectionHeader label="Misc Hourly" />
            <TypeValueTable
              colLabel="# of Units" options={MISC_HOURLY_OPTIONS} step="1"
              entries={activeOption.miscHourlyEntries.map(e => ({ id: e.id, type: e.miscHourlyType, value: e.units }))}
              onAdd={() => addMiscHourlyEntry(activeOption.id)}
              onRemove={eid => removeMiscHourlyEntry(activeOption.id, eid)}
              onTypeChange={(eid, v) => patchMiscHourlyEntry(activeOption.id, eid, { miscHourlyType: v })}
              onValueChange={(eid, raw) => patchMiscHourlyEntry(activeOption.id, eid, { units: raw === '' ? '' : parseFloat(raw) || 0 })}
            />

            {/* ── Other ────────────────────────────────────────────────────── */}
            <SectionHeader label="Other (no standard for)" />
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 space-y-3">
                <div className="grid grid-cols-[1fr_120px_120px_auto] gap-3 text-xs font-medium text-gray-400 px-1">
                  <span>Description</span>
                  <span className="text-center"># of Hours</span>
                  <span className="text-center"># of Gallons</span>
                  <span className="w-6" />
                </div>
                {activeOption.otherEntries.map(entry => (
                  <div key={entry.id} className="grid grid-cols-[1fr_120px_120px_auto] gap-3 items-center">
                    <input
                      type="text" placeholder="Describe the task…"
                      value={entry.description}
                      onChange={e => patchOtherEntry(activeOption.id, entry.id, { description: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <input
                      type="number" step="0.5" min="0" placeholder="0"
                      value={entry.hours}
                      onChange={e => { const r = e.target.value; patchOtherEntry(activeOption.id, entry.id, { hours: r === '' ? '' : parseFloat(r) || 0 }) }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <input
                      type="number" step="0.1" min="0" placeholder="0"
                      value={entry.gallons}
                      onChange={e => { const r = e.target.value; patchOtherEntry(activeOption.id, entry.id, { gallons: r === '' ? '' : parseFloat(r) || 0 }) }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      onClick={() => removeOtherEntry(activeOption.id, entry.id)}
                      disabled={activeOption.otherEntries.length === 1}
                      className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button onClick={() => addOtherEntry(activeOption.id)} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium mt-1 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Task
                </button>
              </div>
            </div>

            {/* ── Photos ───────────────────────────────────────────────────── */}
            <SectionHeader label="Photos" />

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Project Photos</span>
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                    {draft.photoUrls.length} / 20
                  </span>
                </div>
                {draft.photoUrls.length < 20 && (
                  <label className={`flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none ${
                    uploadingPhotos ? 'text-gray-400 pointer-events-none' : 'text-brand-600 hover:text-brand-800'
                  }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    {uploadingPhotos ? 'Uploading…' : 'Add Photos'}
                    <input type="file" accept="image/*" multiple className="sr-only"
                      disabled={uploadingPhotos} onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>

              {uploadError && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  Upload failed: {uploadError}
                </div>
              )}

              {draft.photoUrls.length === 0 ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors">
                  <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                  <p className="text-sm text-gray-400">Click to upload photos</p>
                  <p className="text-xs text-gray-300 mt-1">Up to 20 images</p>
                  <input type="file" accept="image/*" multiple className="sr-only"
                    disabled={uploadingPhotos} onChange={handlePhotoUpload} />
                </label>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {draft.photoUrls.map((url, idx) => (
                    <div key={url} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemovePhoto(url)}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-black/60 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {draft.photoUrls.length < 20 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors">
                      <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="text-xs text-gray-400 mt-1">Add more</span>
                      <input type="file" accept="image/*" multiple className="sr-only"
                        disabled={uploadingPhotos} onChange={handlePhotoUpload} />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* ── Scope of Work ─────────────────────────────────────────────── */}
            <SectionHeader label="Scope of Work" />
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <ScopeField label="Project Description">
                <textarea rows={4}
                  value={draft.scope.projectDescription}
                  onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, projectDescription: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </ScopeField>
              <ScopeField label="Prep Work">
                <textarea rows={18}
                  value={draft.scope.prepWork}
                  onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, prepWork: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                />
              </ScopeField>
              <ScopeField label="Final Touches">
                <textarea rows={6}
                  value={draft.scope.finalTouches}
                  onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, finalTouches: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </ScopeField>
              <ScopeField label="Paint Products">
                <textarea rows={3}
                  value={draft.scope.paintProducts}
                  onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, paintProducts: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </ScopeField>
              <div className="grid grid-cols-2 gap-4">
                <ScopeField label="Number of Colors">
                  <input type="text"
                    value={draft.scope.totalColors}
                    onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, totalColors: e.target.value } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </ScopeField>
                <ScopeField label="Number of Coats">
                  <input type="text"
                    value={draft.scope.totalCoats}
                    onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, totalCoats: e.target.value } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </ScopeField>
              </div>
            </div>

          </div>

          {/* ── Right: overview + calculations ───────────────────────────────── */}
          <div className="w-64 shrink-0 sticky top-24 space-y-4">

            {/* Overview */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Overview</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {OVERVIEW_ROWS.map(row => {
                  const val = overview[row.key]
                  const isActive = val !== null && val !== 0
                  const display = val === null ? 'None' : val === 0 ? '0'
                    : typeof val === 'number' ? (val % 1 === 0 ? String(val) : val.toFixed(2)) : String(val)
                  return (
                    <div key={row.key} className="flex items-center justify-between px-4 py-2">
                      <span className="text-xs text-gray-500">{row.label}</span>
                      <span className={`text-sm font-semibold tabular-nums ${isActive ? 'text-brand-700' : 'text-gray-400'}`}>
                        {display}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Calculations */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Calculations</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {/* Walls */}
                <div className="px-4 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Walls</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Hours</span>
                    <span className={`text-sm font-semibold tabular-nums ${wallCalc.hours > 0 ? 'text-brand-700' : 'text-gray-400'}`}>
                      {wallCalc.hours > 0 ? wallCalc.hours.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">Gallons</span>
                    <span className={`text-sm font-semibold tabular-nums ${wallCalc.gallons > 0 ? 'text-brand-700' : 'text-gray-400'}`}>
                      {wallCalc.gallons > 0 ? wallCalc.gallons : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">Labor</span>
                    <span className={`text-sm font-semibold tabular-nums ${wallCalc.laborCost > 0 ? 'text-brand-700' : 'text-gray-400'}`}>
                      {wallCalc.laborCost > 0 ? `$${wallCalc.laborCost.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">Price</span>
                    <span className={`text-sm font-semibold tabular-nums ${wallCalc.price > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {wallCalc.price > 0 ? `$${wallCalc.price.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Save / Cancel */}
        <div className="flex items-center gap-3 pb-12">
          <button
            onClick={handleSave}
            disabled={saving || !draft.clientName.trim()}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Draft'}
          </button>
          <button
            onClick={() => router.push('/estimates')}
            className="px-6 py-2.5 bg-white hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg border border-gray-200 transition-colors"
          >
            {isEditing ? 'Back to Estimates' : 'Cancel'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ScopeField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-brand-600 border border-dashed border-brand-300 hover:bg-brand-50 transition-colors w-full justify-center"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {label}
    </button>
  )
}

// Type + value table (shared by misc ln ft, sq ft, hourly)
function TypeValueTable({
  colLabel, options, entries, step = '0.1',
  onAdd, onRemove, onTypeChange, onValueChange,
}: {
  colLabel:      string
  options:       { key: string; label: string }[]
  entries:       { id: string; type: string; value: number | '' }[]
  step?:         string
  onAdd:         () => void
  onRemove:      (id: string) => void
  onTypeChange:  (id: string, v: string) => void
  onValueChange: (id: string, raw: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 space-y-3">
        <div className="grid grid-cols-[1fr_140px_auto] gap-3 text-xs font-medium text-gray-400 px-1">
          <span>Type</span>
          <span className="text-center">{colLabel}</span>
          <span className="w-6" />
        </div>
        {entries.map(entry => (
          <div key={entry.id} className="grid grid-cols-[1fr_140px_auto] gap-3 items-center">
            <select
              value={entry.type}
              onChange={e => onTypeChange(entry.id, e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Select type…</option>
              {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <input
              type="number" step={step} min="0" placeholder="0"
              value={entry.value}
              onChange={e => onValueChange(entry.id, e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => onRemove(entry.id)}
              disabled={entries.length === 1}
              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button onClick={onAdd} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium mt-1 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Row
        </button>
      </div>
    </div>
  )
}

function LengthOnlyCard({
  label, index, selectedType, typeOptions, typePlaceholder,
  measurements, canDelete, onTypeChange, onDelete, onAddRow, onRemoveRow, onPatchRow,
}: {
  label: string; index: number; selectedType: string
  typeOptions: { key: string; label: string }[]; typePlaceholder: string
  measurements: { id: string; value: number | '' }[]; canDelete: boolean
  onTypeChange: (v: string) => void; onDelete: () => void
  onAddRow: () => void; onRemoveRow: (id: string) => void; onPatchRow: (id: string, val: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">{label} {index + 1}</span>
        <select value={selectedType} onChange={e => onTypeChange(e.target.value)}
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
          <option value="">{typePlaceholder}</option>
          {typeOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        {canDelete && (
          <button onClick={onDelete} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        )}
      </div>
      <div className="px-5 py-3 space-y-2">
        <div className="grid grid-cols-[200px_auto] gap-3 text-xs font-medium text-gray-400 mb-1 px-1">
          <span>Length (ft)</span><span className="w-6" />
        </div>
        {measurements.map(m => (
          <div key={m.id} className="grid grid-cols-[200px_auto] gap-3 items-center">
            <input type="number" step="0.1" min="0" placeholder="0" value={m.value} onChange={e => onPatchRow(m.id, e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={() => onRemoveRow(m.id)} disabled={measurements.length === 1}
              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button onClick={onAddRow} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium mt-2 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Length
        </button>
      </div>
    </div>
  )
}

function CountCard({
  label, typeOptions, typePlaceholder, entries, max,
  onAdd, onRemove, onTypeChange, onCountChange,
}: {
  label: string; typeOptions: { key: string; label: string }[]; typePlaceholder: string
  entries: { id: string; type: string; count: number | '' }[]; max: number
  onAdd: () => void; onRemove: (id: string) => void
  onTypeChange: (id: string, value: string) => void; onCountChange: (id: string, value: number | '') => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-xs text-gray-400">{entries.length} / {max}</span>
      </div>
      <div className="px-5 py-3 space-y-3">
        <div className="grid grid-cols-[1fr_140px_auto] gap-3 text-xs font-medium text-gray-400 px-1">
          <span>Type</span><span className="text-center">Count</span><span className="w-6" />
        </div>
        {entries.map(entry => (
          <div key={entry.id} className="grid grid-cols-[1fr_140px_auto] gap-3 items-center">
            <select value={entry.type} onChange={e => onTypeChange(entry.id, e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">{typePlaceholder}</option>
              {typeOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <input type="number" min="0" step="1" placeholder="0" value={entry.count}
              onChange={e => { const r = e.target.value; onCountChange(entry.id, r === '' ? '' : parseInt(r) || 0) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={() => onRemove(entry.id)} disabled={entries.length === 1}
              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {entries.length < max ? (
          <button onClick={onAdd} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium mt-1 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Type ({max - entries.length} remaining)
          </button>
        ) : (
          <p className="text-xs text-gray-400 italic">Maximum of {max} types reached.</p>
        )}
      </div>
    </div>
  )
}

function MeasurementCard({
  label, index, selectedType, typeOptions, typePlaceholder,
  col1Label, col2Label, measurements, canDelete,
  onTypeChange, onDelete, onAddRow, onRemoveRow, onPatchRow,
}: {
  label: string; index: number; selectedType: string
  typeOptions: { key: string; label: string }[]; typePlaceholder: string
  col1Label: string; col2Label: string
  measurements: { id: string; a: number | ''; b: number | '' }[]; canDelete: boolean
  onTypeChange: (v: string) => void; onDelete: () => void
  onAddRow: () => void; onRemoveRow: (id: string) => void
  onPatchRow: (id: string, field: 'a' | 'b', val: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">{label} {index + 1}</span>
        <select value={selectedType} onChange={e => onTypeChange(e.target.value)}
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
          <option value="">{typePlaceholder}</option>
          {typeOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        {canDelete && (
          <button onClick={onDelete} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        )}
      </div>
      <div className="px-5 py-3 space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 text-xs font-medium text-gray-400 mb-1 px-1">
          <span>{col1Label}</span><span>{col2Label}</span><span className="w-6" />
        </div>
        {measurements.map(m => (
          <div key={m.id} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
            <input type="number" step="0.1" min="0" placeholder="0" value={m.a} onChange={e => onPatchRow(m.id, 'a', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input type="number" step="0.1" min="0" placeholder="0" value={m.b} onChange={e => onPatchRow(m.id, 'b', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={() => onRemoveRow(m.id)} disabled={measurements.length === 1}
              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button onClick={onAddRow} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium mt-2 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Row
        </button>
      </div>
    </div>
  )
}
