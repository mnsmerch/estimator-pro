'use client'

import { useState } from 'react'

/**
 * Estimator-only control to manually override an estimate's pre-tax subtotal.
 * Rendered only when a logged-in estimator is viewing the proposal — the
 * customer never sees this panel (they just see the resulting numbers).
 * Discount, tax, deposit, and balance all recompute from the override.
 */
export default function EstimatorSubtotalOverride({
  override,
  computedSubtotal,
  onSave,
  fmt,
}: {
  override: number | null
  computedSubtotal: number
  onSave: (value: number | null) => Promise<void>
  fmt: (n: number) => string
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(false)

  function startEdit() {
    setError(false)
    setValue(override != null ? String(override) : (computedSubtotal ? String(Math.round(computedSubtotal * 100) / 100) : ''))
    setEditing(true)
  }

  async function commit(next: number | null) {
    setSaving(true)
    setError(false)
    try {
      await onSave(next)
      setEditing(false)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const parsed = parseFloat(value)
    await commit(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null)
  }

  return (
    <div className="mb-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Estimator only — not shown to customer</span>
      </div>

      {error && (
        <p className="mb-2 text-xs text-red-600">Couldn&apos;t save the override. Please try again.</p>
      )}

      {editing ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number" min="0" step="0.01" autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="Subtotal amount"
              className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : override != null ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Subtotal overridden to <span className="font-semibold text-gray-900 tabular-nums">{fmt(override)}</span>
            <span className="text-gray-400"> · calculated {fmt(computedSubtotal)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={startEdit} className="text-sm font-medium text-green-700 hover:text-green-800">Edit</button>
            <button onClick={() => commit(null)} disabled={saving} className="text-sm font-medium text-gray-400 hover:text-red-500 disabled:opacity-50">Reset</button>
          </div>
        </div>
      ) : (
        <button onClick={startEdit} className="text-sm font-medium text-green-700 hover:text-green-800">
          Override subtotal price
        </button>
      )}
    </div>
  )
}
