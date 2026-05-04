'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_INTERIOR_RATES } from '@/lib/defaultSettings'
import type { InteriorProductionRates } from '@/types/interiorSettings'

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
