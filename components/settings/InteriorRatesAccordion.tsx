'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_INTERIOR_RATES } from '@/lib/defaultSettings'
import type { InteriorProductionRates, WallTypeRate } from '@/types/interiorSettings'

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

  const wallTypes    = rates.wallTypes    ?? {}
  const ceilingTypes = rates.ceilingTypes ?? {}

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
