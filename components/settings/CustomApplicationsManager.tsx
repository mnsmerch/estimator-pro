'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_RATES } from '@/lib/defaultSettings'
import type { ProductionRates, CustomApplication } from '@/types/settings'

// Categories an admin can add custom options to. The complex window/door/garage
// categories are intentionally excluded — they need trim-length + color logic.
const CATEGORIES: { key: string; label: string; staining?: boolean }[] = [
  { key: 'prepWork',        label: 'Prep Work'        },
  { key: 'bodyApplication', label: 'Body Application' },
  { key: 'eaves',           label: 'Eaves'            },
  { key: 'fascia',          label: 'Fascia'           },
  { key: 'otherTrim',       label: 'Other Trim'       },
  { key: 'railings',        label: 'Railings'         },
  { key: 'shutters',        label: 'Shutters'         },
  { key: 'staining',        label: 'Staining', staining: true },
  { key: 'woodReplacement', label: 'Wood Replacement' },
]

const UNITS = ['SqFt', 'LnFt', 'Units', 'Hrs', '#']

export default function CustomApplicationsManager() {
  const [rates, setRates]   = useState<ProductionRates | null>(null)
  const [apps, setApps]     = useState<CustomApplication[]>([])
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    getSettingsDoc<ProductionRates>('rates', DEFAULT_RATES)
      .then(r => { setRates(r); setApps(r.customApplications ?? []) })
      .finally(() => setStatus('idle'))
  }, [])

  function update(id: string, patch: Partial<CustomApplication>) {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }
  function addApp() {
    const cat = CATEGORIES[0]
    setApps(prev => [...prev, {
      id:            `custom-${Date.now().toString(36)}`,
      categoryKey:   cat.key,
      categoryLabel: cat.label,
      label:         '',
      unitLabel:     'SqFt',
      rate:          0,
    }])
  }
  function removeApp(id: string) {
    if (!confirm('Remove this custom option? Estimates that already use it will lose its rate.')) return
    setApps(prev => prev.filter(a => a.id !== id))
  }
  function setCategory(id: string, categoryKey: string) {
    const cat = CATEGORIES.find(c => c.key === categoryKey)!
    update(id, { categoryKey, categoryLabel: cat.label })
  }

  async function handleSave() {
    if (apps.some(a => !a.label.trim())) { alert('Every custom option needs a name.'); return }
    if (apps.some(a => !(a.rate > 0)))   { alert('Every custom option needs a production rate greater than 0.'); return }
    if (!rates) return
    setStatus('saving')
    try {
      await saveSettingsDoc('rates', { ...rates, customApplications: apps })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500">
          Add your own line-item options to the estimate dropdowns (Prep Work, Body Application, Staining, etc.).
          Each option appears under its category when building an estimate.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          <strong>Rate</strong> = how many units one painter completes per hour (e.g. 200 SqFt/hr). Higher rate = fewer hours = lower cost.
          For <strong>Staining</strong>, set <strong>Paint Coverage</strong> = sq ft per unit so paint gallons are calculated.
        </p>
      </div>

      {apps.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          No custom options yet. Click “Add Option” below to create one.
        </div>
      )}

      {apps.map(a => {
        const isStaining = a.categoryKey === 'staining'
        return (
          <div key={a.id} className="rounded-xl border border-gray-200 p-4 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select
                  value={a.categoryKey}
                  onChange={e => setCategory(a.id, e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Option Name</label>
                <input
                  type="text"
                  value={a.label}
                  onChange={e => update(a.id, { label: e.target.value })}
                  placeholder="e.g. Pressure Wash Heavy"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                <select
                  value={a.unitLabel}
                  onChange={e => update(a.id, { unitLabel: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Rate (units/hr)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={a.rate || ''}
                  onChange={e => update(a.id, { rate: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  onClick={() => removeApp(a.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="Remove option"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
            {isStaining && (
              <div className="mt-3 pt-3 border-t border-gray-100 sm:w-1/2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Paint Coverage (sq ft per unit)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={a.surfaceAreaFactor ?? ''}
                  onChange={e => update(a.id, { surfaceAreaFactor: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g. 1 for SqFt, ~8 for LnFt fence"
                  className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={addApp}
        className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Option
      </button>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save Options'}
        </button>
        {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
      </div>
    </div>
  )
}
