'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_RATES } from '@/lib/defaultSettings'
import type { ProductionRates, TrimRate, StainingRateItem } from '@/types/settings'

// ── Metadata for rendering each category ─────────────────────

const PREP_WORK = [
  { key: 'powerWash',         label: 'Power Wash',                                unit: 'SqFt/Hr' },
  { key: 'scrapeOneBoard',    label: 'Scrape 1 Side of Board',                    unit: 'LnFt/Hr' },
  { key: 'scrapeSurface',     label: 'Scrape Surface',                            unit: 'SqFt/Hr' },
  { key: 'scuffSand',         label: 'Scuff Sand',                                unit: 'SqFt/Hr' },
  { key: 'lightSand',         label: 'Light Sand',                                unit: 'SqFt/Hr' },
  { key: 'heavySand',         label: 'Heavy Sand',                                unit: 'SqFt/Hr' },
  { key: 'primingBrushSqft',  label: 'Priming w/ Brush',                          unit: 'SqFt/Hr' },
  { key: 'primingBrushLnft',  label: 'Priming w/ Brush',                          unit: 'LnFt/Hr' },
  { key: 'scrapeSandPrimeLnft',label: 'Scrape, Sand, & Prime',                    unit: 'LnFt/Hr' },
  { key: 'ssp75to100',        label: 'Scrape, Sand, & Prime 75–100% Peeling',     unit: 'SqFt/Hr' },
  { key: 'ssp50to75',         label: 'Scrape, Sand, & Prime 50–75% Peeling',      unit: 'SqFt/Hr' },
  { key: 'ssp25to50',         label: 'Scrape, Sand, & Prime 25–50% Peeling',      unit: 'SqFt/Hr' },
  { key: 'ssp25orLess',       label: 'Scrape, Sand, & Prime 25% or Less Peeling', unit: 'SqFt/Hr' },
  { key: 'sspLocalized',      label: 'Scrape, Sand, & Prime Localized Failure',   unit: '#/Hr'    },
  { key: 'caulking1Story',    label: 'Caulking — 1 Story',                        unit: 'LnFt/Hr' },
  { key: 'caulking2Story',    label: 'Caulking — 2 Story',                        unit: 'LnFt/Hr' },
  { key: 'caulking3Story',    label: 'Caulking — 3rd Story',                      unit: 'LnFt/Hr' },
  { key: 'manualPrepHours',   label: 'Manual Prep Hours',                         unit: 'Hr'      },
  { key: 'miscHazardHours',   label: 'Misc / Hazard Hours',                       unit: 'Hr'      },
  { key: 'managerUnits',      label: 'Manager Units',                             unit: '#'       },
]

const BODY_APPLICATION = [
  { key: 'sidingSpray',               label: 'Siding Spray',                        unit: 'SqFt/Hr' },
  { key: 'sidingSprayBackroll',        label: 'Siding Spray w/ Light Backroll',      unit: 'SqFt/Hr' },
  { key: 'sidingRoll',                 label: 'Siding Roll',                         unit: 'SqFt/Hr' },
  { key: 'masonrySpray',               label: 'Masonry Spray',                       unit: 'SqFt/Hr' },
  { key: 'masonrySprayBackroll',       label: 'Masonry Spray w/ Light Backroll',     unit: 'SqFt/Hr' },
  { key: 'masonryRoll',                label: 'Masonry Roll',                        unit: 'SqFt/Hr' },
  { key: 'sidingBrush',                label: 'Siding Brush',                        unit: 'SqFt/Hr' },
  { key: 'masonryBrush',               label: 'Masonry Brush',                       unit: 'SqFt/Hr' },
  { key: 'oneCoatSidingSpray',         label: 'One Coat Only Siding Spray',          unit: 'SqFt/Hr' },
  { key: 'accentSidingSpray',          label: 'Accent Siding Spray',                 unit: 'SqFt/Hr' },
  { key: 'accentSidingSprayBackroll',  label: 'Accent Siding Spray w/ Backroll',     unit: 'SqFt/Hr' },
  { key: 'accentSidingRoll',           label: 'Accent Siding Roll',                  unit: 'SqFt/Hr' },
  { key: 'accentMasonrySpray',         label: 'Accent Masonry Spray',                unit: 'SqFt/Hr' },
  { key: 'accentMasonrySprayBackroll', label: 'Accent Masonry Spray w/ Backroll',    unit: 'SqFt/Hr' },
  { key: 'accentMasonryRoll',          label: 'Accent Masonry Roll',                 unit: 'SqFt/Hr' },
  { key: 'accentSidingBrush',          label: 'Accent Siding Brush',                 unit: 'SqFt/Hr' },
  { key: 'accentMasonryBrush',         label: 'Accent Masonry Brush',                unit: 'SqFt/Hr' },
  { key: 'stainingShakesBackbrush',    label: 'Staining Shakes w/ Back Brush',       unit: 'SqFt/Hr' },
]

const EAVES = [
  { key: 'eavesBodyColor',       label: 'Eaves Body Color',          unit: 'LnFt/Hr' },
  { key: 'eavesTrimColor',       label: 'Eaves Trim Color',          unit: 'LnFt/Hr' },
  { key: 'eavesSeparateColor',   label: 'Eaves Separate Color',      unit: 'LnFt/Hr' },
  { key: 'eaves3rdBodyColor',    label: '3rd Story Eaves Body Color', unit: 'LnFt/Hr' },
  { key: 'eaves3rdTrimColor',    label: '3rd Story Eaves Trim Color', unit: 'LnFt/Hr' },
  { key: 'eaves3rdSeparateColor',label: '3rd Story Eaves Sep. Color', unit: 'LnFt/Hr' },
]

const FASCIA = [
  { key: 'fascia1Story', label: 'Fascia — 1 Story',  unit: 'LnFt/Hr' },
  { key: 'fascia2Story', label: 'Fascia — 2 Story',  unit: 'LnFt/Hr' },
  { key: 'fascia3Story', label: 'Fascia — 3rd Story', unit: 'LnFt/Hr' },
]

const WINDOWS = [
  { key: 'vinylNoTrim',            label: 'Vinyl — No Trim'                },
  { key: 'woodNoTrimBody',         label: 'Wood — No Trim (Body Color)'    },
  { key: 'vinylWithTrim',          label: 'Vinyl — With Trim'              },
  { key: 'woodDontOpen',           label: 'Wood — Don\'t Open'             },
  { key: 'woodOpen',               label: 'Wood — Open'                    },
  { key: 'threeDVinyl',            label: '3D Vinyl'                       },
  { key: 'threeDWoodDontOpen',     label: '3D Wood — Don\'t Open'          },
  { key: 'threeDWoodOpen',         label: '3D Wood — Open'                 },
  { key: 'twoToneWoodDontOpen',    label: '2-Tone Wood — Don\'t Open'      },
  { key: 'twoToneWoodOpen',        label: '2-Tone Wood — Open'             },
  { key: 'threeD2ToneWoodDontOpen',label: '3D 2-Tone Wood — Don\'t Open'   },
  { key: 'threeD2ToneWoodOpen',    label: '3D 2-Tone Wood — Open'          },
]

const OTHER_TRIM = [
  { key: 'otherTrim1Story',           label: 'Other Trim — 1 Story',             unit: 'LnFt/Hr' },
  { key: 'otherTrim2PlusStory',       label: 'Other Trim — 2+ Story',            unit: 'LnFt/Hr' },
  { key: 'downspoutsPosts',           label: 'Downspouts / Posts (3–4 sides)',    unit: 'LnFt/Hr' },
  { key: 'trim3D',                    label: '3D Trim',                          unit: 'LnFt/Hr' },
  { key: 'tudorTrimFacing',           label: 'Tudor Trim Facing',                unit: 'LnFt/Hr' },
  { key: 'tudorTrim3D',               label: 'Tudor Trim 3D',                    unit: 'LnFt/Hr' },
  { key: 'removeReinstallDownspouts', label: 'Remove & Reinstall Downspouts',    unit: 'LnFt/Hr' },
  { key: 'justRemoveDownspouts',      label: 'Just Remove Downspouts',           unit: 'LnFt/Hr' },
]

const DOORS = [
  { key: 'bodyColorNoTrim',         label: 'Body Color — No Trim'          },
  { key: 'bodyColorWithTrim',       label: 'Body Color — With Trim'        },
  { key: 'trimColorNoTrim',         label: 'Trim Color — No Trim'          },
  { key: 'trimColorWithTrim',       label: 'Trim Color — With Trim'        },
  { key: 'accentColorNoTrim',       label: 'Accent Color — No Trim'        },
  { key: 'accentColorWithTrim',     label: 'Accent Color — With Trim'      },
  { key: 'stainedToPaintedNoTrim',  label: 'Stained to Painted — No Trim'  },
  { key: 'stainedToPaintedWithTrim',label: 'Stained to Painted — With Trim'},
]

const SIDELIGHTS = [
  { key: 'bodyColorNoTrim',         label: 'Body Color — No Trim'          },
  { key: 'bodyColorWithTrim',       label: 'Body Color — With Trim'        },
  { key: 'trimColorNoTrim',         label: 'Trim Color — No Trim'          },
  { key: 'trimColorWithTrim',       label: 'Trim Color — With Trim'        },
  { key: 'accentColorNoTrim',       label: 'Accent Color — No Trim'        },
  { key: 'accentColorWithTrim',     label: 'Accent Color — With Trim'      },
  { key: 'stainedToPaintedNoTrim',  label: 'Stained to Painted — No Trim'  },
  { key: 'stainedToPaintedWithTrim',label: 'Stained to Painted — With Trim'},
]

const GARAGE_DOORS = [
  { key: 'singleBodyColor',          label: 'Single — Body Color'              },
  { key: 'singleBodyColorWindows',   label: 'Single — Body Color w/ Windows'   },
  { key: 'singleTrimColor',          label: 'Single — Trim Color'              },
  { key: 'singleTrimColorWindows',   label: 'Single — Trim Color w/ Windows'   },
  { key: 'singleAccentColor',        label: 'Single — Accent Color'            },
  { key: 'singleAccentColorWindows', label: 'Single — Accent Color w/ Windows' },
  { key: 'doubleBodyColor',          label: 'Double — Body Color'              },
  { key: 'doubleBodyColorWindows',   label: 'Double — Body Color w/ Windows'   },
  { key: 'doubleTrimColor',          label: 'Double — Trim Color'              },
  { key: 'doubleTrimColorWindows',   label: 'Double — Trim Color w/ Windows'   },
  { key: 'doubleAccentColor',        label: 'Double — Accent Color'            },
  { key: 'doubleAccentColorWindows', label: 'Double — Accent Color w/ Windows' },
]

const RAILINGS = [
  { key: 'railings1Color',     label: 'Railings — 1 Color',      unit: 'LnFt/Hr' },
  { key: 'railings2ColorEasy', label: 'Railings — 2 Colors Easy', unit: 'LnFt/Hr' },
  { key: 'railings2ColorHard', label: 'Railings — 2 Colors Hard', unit: 'LnFt/Hr' },
]

const SHUTTERS = [
  { key: 'accentGround', label: 'Accent — Ground/Roof Reachable', unit: 'Units/Hr' },
  { key: 'accentLadder', label: 'Accent — Ladder Only',           unit: 'Units/Hr' },
  { key: 'trimGround',   label: 'Trim — Ground/Roof Reachable',   unit: 'Units/Hr' },
  { key: 'trimLadder',   label: 'Trim — Ladder Only',             unit: 'Units/Hr' },
]

const STAINING = [
  { key: 'deckSolidStain',      label: 'Deck Surface — Solid Stain',         unit: 'SqFt/Hr' },
  { key: 'stairsSolidStain',    label: 'Stairs — Solid Stain',               unit: 'Units/Hr' },
  { key: 'fenceFlatSpray',      label: 'Fence Flat Side — Spray',            unit: 'LnFt/Hr' },
  { key: 'fenceBeamsSpray',     label: 'Fence Beam Side — Spray',            unit: 'LnFt/Hr' },
  { key: 'fenceFlatBrushRoll',  label: 'Fence Flat Side — Brush/Roll',       unit: 'LnFt/Hr' },
  { key: 'fenceBeamsBrushRoll', label: 'Fence Beam Side — Brush/Roll',       unit: 'LnFt/Hr' },
  { key: 'stainRailings',       label: 'Stain Railings',                     unit: 'LnFt/Hr' },
  { key: 'stainPosts',          label: 'Stain Posts',                        unit: 'Units/Hr' },
  { key: 'stainTrim',           label: 'Stain Trim',                         unit: 'LnFt/Hr' },
]

const WOOD_REPLACEMENT = [
  { key: 'trim1Story',           label: '1st Story Trim',                          unit: '$/LnFt' },
  { key: 'trim2Story',           label: '2nd Story Trim',                          unit: '$/LnFt' },
  { key: 'regularSiding1Story',  label: '1st Story Regular Siding',                unit: '$/LnFt' },
  { key: 'regularSiding2Story',  label: '2nd Story Regular Siding',                unit: '$/LnFt' },
  { key: 'cementFiber1Story',    label: '1st Story Cement Fiber (Hardie)',          unit: '$/LnFt' },
  { key: 'cementFiber2Story',    label: '2nd Story Cement Fiber (Hardie)',          unit: '$/LnFt' },
  { key: 'doorFrame',            label: 'Part or Entire Door Frame',               unit: '$/Unit' },
  { key: 'fascia1Story',         label: '1st Story Fascia',                        unit: '$/LnFt' },
  { key: 'fascia2Story',         label: '2nd Story Fascia',                        unit: '$/LnFt' },
  { key: 'fascia1StoryGutter',   label: '1st Story Fascia w/ Gutter',              unit: '$/LnFt' },
  { key: 'fascia2StoryGutter',   label: '2nd Story Fascia w/ Gutter',              unit: '$/LnFt' },
  { key: 'railings',             label: 'Railings',                                unit: '$/LnFt' },
  { key: 'eaveSoffit1Story',     label: '1st Story Eave/Soffit',                   unit: '$/LnFt' },
  { key: 'eaveSoffit2Story',     label: '2nd Story Eave/Soffit',                   unit: '$/LnFt' },
  { key: 'hardieBoard',          label: 'Larger Area Hardie Siding',               unit: '$/SqFt' },
]

// ── Main component ─────────────────────────────────────────────

export default function RatesAccordion() {
  const [rates, setRates] = useState<ProductionRates>(DEFAULT_RATES)
  const [open, setOpen] = useState<string | null>('prepWork')
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    getSettingsDoc<ProductionRates>('rates', DEFAULT_RATES)
      .then(setRates)
      .finally(() => setStatus('idle'))
  }, [])

  function setSimpleRate(category: keyof ProductionRates, key: string, value: number) {
    setRates(prev => ({
      ...prev,
      [category]: { ...(prev[category] as Record<string, number>), [key]: value }
    }))
  }

  function setTrimRate(category: keyof ProductionRates, key: string, field: keyof TrimRate, value: number) {
    const cat = rates[category] as Record<string, TrimRate>
    setRates(prev => ({
      ...prev,
      [category]: { ...cat, [key]: { ...cat[key], [field]: value } }
    }))
  }

  function setStainingRate(key: string, field: keyof StainingRateItem, value: number) {
    setRates(prev => ({
      ...prev,
      staining: { ...prev.staining, [key]: { ...prev.staining[key], [field]: value } }
    }))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await saveSettingsDoc('rates', rates)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  const toggle = (key: string) => setOpen(o => o === key ? null : key)

  return (
    <div className="space-y-2">

      {/* Simple rate categories */}
      <SimpleSection id="prepWork" label="Prep Work" open={open} toggle={toggle}
        items={PREP_WORK} rates={rates.prepWork}
        onChange={(k, v) => setSimpleRate('prepWork', k, v)} />

      <SimpleSection id="bodyApplication" label="Body Application" open={open} toggle={toggle}
        items={BODY_APPLICATION} rates={rates.bodyApplication}
        onChange={(k, v) => setSimpleRate('bodyApplication', k, v)} />

      <SimpleSection id="eaves" label="Eaves" open={open} toggle={toggle}
        items={EAVES} rates={rates.eaves}
        onChange={(k, v) => setSimpleRate('eaves', k, v)} />

      <SimpleSection id="fascia" label="Fascia" open={open} toggle={toggle}
        items={FASCIA} rates={rates.fascia}
        onChange={(k, v) => setSimpleRate('fascia', k, v)} />

      {/* Trim rate categories */}
      <TrimSection id="windows" label="Windows" open={open} toggle={toggle}
        items={WINDOWS} rates={rates.windows}
        onChange={(k, f, v) => setTrimRate('windows', k, f, v)} />

      <SimpleSection id="otherTrim" label="Other Trim" open={open} toggle={toggle}
        items={OTHER_TRIM} rates={rates.otherTrim}
        onChange={(k, v) => setSimpleRate('otherTrim', k, v)} />

      <TrimSection id="doors" label="Doors" open={open} toggle={toggle}
        items={DOORS} rates={rates.doors}
        onChange={(k, f, v) => setTrimRate('doors', k, f, v)} />

      <TrimSection id="sidelights" label="Sidelights" open={open} toggle={toggle}
        items={SIDELIGHTS} rates={rates.sidelights}
        onChange={(k, f, v) => setTrimRate('sidelights', k, f, v)} />

      <TrimSection id="garageDoors" label="Garage Doors" open={open} toggle={toggle}
        items={GARAGE_DOORS} rates={rates.garageDoors}
        onChange={(k, f, v) => setTrimRate('garageDoors', k, f, v)} />

      <SimpleSection id="railings" label="Railings" open={open} toggle={toggle}
        items={RAILINGS} rates={rates.railings}
        onChange={(k, v) => setSimpleRate('railings', k, v)} />

      <SimpleSection id="shutters" label="Shutters" open={open} toggle={toggle}
        items={SHUTTERS} rates={rates.shutters}
        onChange={(k, v) => setSimpleRate('shutters', k, v)} />

      {/* Staining */}
      <AccordionSection id="staining" label="Staining" open={open} toggle={toggle}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 font-semibold text-gray-600">Task</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600">Rate</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600">Unit</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600">Surface Area Factor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {STAINING.map(({ key, label, unit }) => {
              const item = rates.staining[key] ?? { rate: 0, surfaceAreaFactor: 0 }
              return (
                <tr key={key}>
                  <td className="px-4 py-2 text-gray-700">{label}</td>
                  <td className="px-4 py-2 text-right">
                    <RateInput value={item.rate} onChange={v => setStainingRate(key, 'rate', v)} />
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400 text-xs">{unit}</td>
                  <td className="px-4 py-2 text-right">
                    <RateInput value={item.surfaceAreaFactor} onChange={v => setStainingRate(key, 'surfaceAreaFactor', v)} step={0.001} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </AccordionSection>

      {/* Wood Replacement */}
      <SimpleSection id="woodReplacement" label="Wood Replacement" open={open} toggle={toggle}
        items={WOOD_REPLACEMENT} rates={rates.woodReplacement}
        onChange={(k, v) => setSimpleRate('woodReplacement', k, v)}
        ratePrefix="$" />

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save All Rates'}
        </button>
        {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
      </div>
    </div>
  )
}

// ── Reusable section components ───────────────────────────────

function AccordionSection({ id, label, open, toggle, children }: {
  id: string; label: string; open: string | null
  toggle: (id: string) => void; children: React.ReactNode
}) {
  const isOpen = open === id
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-gray-400 text-lg">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="overflow-x-auto">{children}</div>}
    </div>
  )
}

function SimpleSection({ id, label, open, toggle, items, rates, onChange, ratePrefix }: {
  id: string; label: string; open: string | null; toggle: (id: string) => void
  items: { key: string; label: string; unit?: string }[]
  rates: Record<string, number>
  onChange: (key: string, value: number) => void
  ratePrefix?: string
}) {
  return (
    <AccordionSection id={id} label={label} open={open} toggle={toggle}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2 font-semibold text-gray-600">Task</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-600">Rate</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-600">Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(({ key, label, unit }) => (
            <tr key={key}>
              <td className="px-4 py-2 text-gray-700">{label}</td>
              <td className="px-4 py-2 text-right">
                <RateInput
                  value={rates[key] ?? 0}
                  onChange={v => onChange(key, v)}
                  prefix={ratePrefix}
                />
              </td>
              <td className="px-4 py-2 text-right text-gray-400 text-xs">{unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AccordionSection>
  )
}

function TrimSection({ id, label, open, toggle, items, rates, onChange }: {
  id: string; label: string; open: string | null; toggle: (id: string) => void
  items: { key: string; label: string }[]
  rates: Record<string, TrimRate>
  onChange: (key: string, field: keyof TrimRate, value: number) => void
}) {
  return (
    <AccordionSection id={id} label={label} open={open} toggle={toggle}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2 font-semibold text-gray-600">Type</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-600">Units/Hr</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-600">Hrs/Unit</th>
            <th className="text-right px-4 py-2 font-semibold text-gray-600">LnFt Trim</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(({ key, label }) => {
            const item = rates[key] ?? { unitsPerHr: 0, trimLnFt: 0 }
            const hrsPerUnit = item.unitsPerHr > 0 ? (1 / item.unitsPerHr).toFixed(3) : '—'
            return (
              <tr key={key}>
                <td className="px-4 py-2 text-gray-700">{label}</td>
                <td className="px-4 py-2 text-right">
                  <RateInput value={item.unitsPerHr} onChange={v => onChange(key, 'unitsPerHr', v)} step={0.01} />
                </td>
                <td className="px-4 py-2 text-right text-gray-500 text-xs tabular-nums">{hrsPerUnit}</td>
                <td className="px-4 py-2 text-right">
                  <RateInput value={item.trimLnFt} onChange={v => onChange(key, 'trimLnFt', v)} step={1} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </AccordionSection>
  )
}

function RateInput({ value, onChange, step = 0.01, prefix }: {
  value: number; onChange: (v: number) => void; step?: number; prefix?: string
}) {
  return (
    <div className="relative inline-flex items-center">
      {prefix && <span className="absolute left-2 text-gray-400 text-xs">{prefix}</span>}
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`w-24 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${prefix ? 'pl-5 pr-2' : 'px-2'}`}
      />
    </div>
  )
}
