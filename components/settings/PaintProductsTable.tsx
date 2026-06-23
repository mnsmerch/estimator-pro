'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_PAINT_PRODUCTS } from '@/lib/defaultSettings'
import type { PaintProduct } from '@/types/settings'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'product'
}

export default function PaintProductsTable() {
  const [products, setProducts] = useState<PaintProduct[]>(DEFAULT_PAINT_PRODUCTS)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    getSettingsDoc<{ items: PaintProduct[] }>('paintProducts', { items: DEFAULT_PAINT_PRODUCTS })
      .then(d => setProducts(d.items?.length ? d.items : DEFAULT_PAINT_PRODUCTS))
      .finally(() => setStatus('idle'))
  }, [])

  function updateNum(id: string, field: 'singleGallon' | 'fiveGallon' | 'coverage', value: number) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }
  function updateName(id: string, name: string) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }
  function addProduct() {
    const id = `custom-${slugify('new product')}-${Date.now().toString(36)}`
    setProducts(prev => [...prev, { id, name: '', singleGallon: 0, fiveGallon: 0, coverage: 400 }])
  }
  function removeProduct(id: string) {
    if (!confirm('Remove this paint product? It will no longer appear in estimate dropdowns after you save.')) return
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  async function handleSave() {
    // Guard: every product needs a name
    if (products.some(p => !p.name.trim())) {
      alert('Every product needs a name before saving.')
      return
    }
    setStatus('saving')
    try {
      await saveSettingsDoc('paintProducts', { items: products })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Add new paints/stains, rename them, update prices, or remove ones you no longer use. These appear in the body/trim and deck &amp; fence dropdowns when building estimates. <span className="text-gray-400">Five Gal is the per-gallon price when buying a 5-gallon bucket. Coverage is sq ft per gallon.</span>
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600 min-w-[240px]">Paint Product</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Single Gal</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Five Gal</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Coverage</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => updateName(p.id, e.target.value)}
                    placeholder="Product name…"
                    className="w-full px-2 py-1 text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-brand-400 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-transparent"
                  />
                </td>
                <td className="px-4 py-2">
                  <PriceInput value={p.singleGallon} onChange={v => updateNum(p.id, 'singleGallon', v)} />
                </td>
                <td className="px-4 py-2">
                  <PriceInput value={p.fiveGallon} onChange={v => updateNum(p.id, 'fiveGallon', v)} />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={p.coverage}
                    onChange={e => updateNum(p.id, 'coverage', parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1 text-right text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => removeProduct(p.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title="Remove product"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={addProduct}
        className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Paint Product
      </button>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save Products'}
        </button>
        {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
      </div>
    </div>
  )
}

function PriceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-24 ml-auto">
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
