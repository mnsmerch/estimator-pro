'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_INTERIOR_PAINT_PRODUCTS } from '@/lib/defaultSettings'
import type { InteriorPaintProduct } from '@/types/interiorSettings'

export default function InteriorPaintProductsTable() {
  const [products, setProducts] = useState<InteriorPaintProduct[]>(DEFAULT_INTERIOR_PAINT_PRODUCTS)
  const [status, setStatus]     = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    getSettingsDoc<{ items: InteriorPaintProduct[] }>('interiorPaintProducts', { items: DEFAULT_INTERIOR_PAINT_PRODUCTS })
      .then(d => setProducts(d.items))
      .finally(() => setStatus('idle'))
  }, [])

  function update(id: string, field: keyof InteriorPaintProduct, value: number) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await saveSettingsDoc('interiorPaintProducts', { items: products })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Update prices when Sherwin-Williams or Benjamin Moore changes their rates. Coverage is sq ft per gallon.</p>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Paint Product</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Price / Gal</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Coverage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-4 py-2 text-gray-800">{p.name}</td>
                <td className="px-4 py-2">
                  <PriceInput value={p.pricePerGallon} onChange={v => update(p.id, 'pricePerGallon', v)} />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={p.coverage}
                    onChange={e => update(p.id, 'coverage', parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save Prices'}
        </button>
        {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
      </div>
    </div>
  )
}

function PriceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-24">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full pl-5 pr-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}
