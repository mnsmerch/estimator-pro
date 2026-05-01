'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getSettingsDoc } from '@/lib/firebase/settings'
import { createEstimate } from '@/lib/firebase/estimates'
import { buildApplicationList, CATEGORY_ORDER } from '@/lib/applicationList'
import { calcEstimate, calcMarkup } from '@/lib/estimateEngine'
import { SCOPE_DEFAULTS } from '@/types/estimate'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
} from '@/lib/defaultSettings'
import type { BusinessRules, ProductionConstants, PaintProduct, ProductionRates } from '@/types/settings'
import type { EstimateRow } from '@/types/estimate'

// ─── helpers ──────────────────────────────────────────────────────────────────

function newRow(applicationKey = ''): EstimateRow {
  return { id: crypto.randomUUID(), applicationKey, front: 0, right: 0, back: 0, left: 0 }
}

// Default rows pre-selected to match the standard estimate template
const DEFAULT_ROW_KEYS = [
  'bodyApplication.sidingSpray',
  'eaves.eavesBodyColor',
  'fascia.fascia2Story',
  'windows.vinylWithTrim',
  'otherTrim.otherTrim2PlusStory',
  'otherTrim.downspoutsPosts',
  'doors.accentColorWithTrim',
  'doors.bodyColorWithTrim',
  'sidelights.accentColorWithTrim',
  'garageDoors.singleBodyColor',
  'garageDoors.doubleBodyColor',
  'railings.railings1Color',
  'shutters.accentGround',
  'shutters.accentLadder',
  'prepWork.manualPrepHours',
  'prepWork.powerWash',
  'bodyApplication.sidingSpray',
  'windows.vinylNoTrim',
  'bodyApplication.oneCoatSidingSpray',
]

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtHrs(n: number) {
  return n.toFixed(1)
}

function fmtGal(n: number) {
  return n.toFixed(1)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewEstimatePage() {
  const { user } = useAuth()
  const router = useRouter()

  // Settings loaded from Firestore
  const [rules, setRules] = useState<BusinessRules>(DEFAULT_BUSINESS_RULES)
  const [constants, setConstants] = useState<ProductionConstants>(DEFAULT_PRODUCTION_CONSTANTS)
  const [paintProducts, setPaintProducts] = useState<PaintProduct[]>(DEFAULT_PAINT_PRODUCTS)
  const [rates, setRates] = useState<ProductionRates>(DEFAULT_RATES)
  const [loadingSettings, setLoadingSettings] = useState(true)

  // Client info
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientFolderId, setClientFolderId] = useState('')
  const [clientContactId, setClientContactId] = useState('')

  // Measurement rows — pre-populated with the standard template
  const [rows, setRows] = useState<EstimateRow[]>(() => DEFAULT_ROW_KEYS.map(k => newRow(k)))

  // Paint selections (store paint product id)
  const [bodyPaintId, setBodyPaintId]     = useState('')
  const [trimPaintId, setTrimPaintId]     = useState('')
  const [accentPaintId, setAccentPaintId] = useState('')
  const [stainPaintId, setStainPaintId]   = useState('')

  // Scope of work
  const [scopeProject, setScopeProject]         = useState(SCOPE_DEFAULTS.scopeProject)
  const [scopePrepWork, setScopePrepWork]       = useState(SCOPE_DEFAULTS.scopePrepWork)
  const [scopePainting, setScopePainting]       = useState(SCOPE_DEFAULTS.scopePainting)
  const [scopeCleanUp, setScopeCleanUp]         = useState(SCOPE_DEFAULTS.scopeCleanUp)
  const [scopeWalkThrough, setScopeWalkThrough] = useState(SCOPE_DEFAULTS.scopeWalkThrough)
  const [scopePaintProducts, setScopePaintProducts] = useState(SCOPE_DEFAULTS.scopePaintProducts)
  const [totalColors, setTotalColors] = useState('')
  const [totalCoats, setTotalCoats]   = useState('')

  const [saving, setSaving] = useState(false)

  // Load settings — wait for auth user before reading Firestore
  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const [r, c, pp, rt] = await Promise.all([
          getSettingsDoc<BusinessRules>('businessRules', DEFAULT_BUSINESS_RULES),
          getSettingsDoc<ProductionConstants>('productionConstants', DEFAULT_PRODUCTION_CONSTANTS),
          getSettingsDoc<{ items: PaintProduct[] }>('paintProducts', { items: DEFAULT_PAINT_PRODUCTS }),
          getSettingsDoc<ProductionRates>('rates', DEFAULT_RATES),
        ])
        setRules(r)
        setConstants(c)
        setPaintProducts(pp.items ?? DEFAULT_PAINT_PRODUCTS)
        setRates(rt)
      } catch (err) {
        console.error('Failed to load settings, using defaults:', err)
      } finally {
        setLoadingSettings(false)
      }
    }
    load()
  }, [user])

  // Application list & map (recalc when rates change)
  const applications = useMemo(() => buildApplicationList(rates), [rates])
  const appMap = useMemo(
    () => new Map(applications.map(a => [a.uniqueKey, a])),
    [applications],
  )

  // Grouped options for dropdown
  const groupedApps = useMemo(() => {
    return CATEGORY_ORDER.map(catLabel => ({
      label: catLabel,
      options: applications.filter(a => a.categoryLabel === catLabel),
    }))
  }, [applications])

  // Resolved paint products
  const emptyPaint: PaintProduct = { id: '', name: '', singleGallon: 0, fiveGallon: 0, coverage: 400 }
  const bodyPaint   = paintProducts.find(p => p.id === bodyPaintId)   ?? emptyPaint
  const trimPaint   = paintProducts.find(p => p.id === trimPaintId)   ?? emptyPaint
  const accentPaint = paintProducts.find(p => p.id === accentPaintId) ?? emptyPaint
  const stainPaint  = paintProducts.find(p => p.id === stainPaintId)  ?? emptyPaint

  // Live calculation
  const totals = useMemo(() => {
    const validRows = rows.filter(r => r.applicationKey !== '')
    if (validRows.length === 0) return null
    return calcEstimate(validRows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint)
  }, [rows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint])

  // Markup display
  const markup = useMemo(() => calcMarkup(rules), [rules])

  // Row handlers
  const addRow = useCallback(() => setRows(r => [...r, newRow()]), [])
  const removeRow = useCallback((id: string) => setRows(r => r.filter(row => row.id !== id)), [])
  const updateRow = useCallback((id: string, field: keyof EstimateRow, value: string | number) => {
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row))
  }, [])

  // Save
  async function handleSave(status: 'draft' | 'sent') {
    if (!user) return
    setSaving(true)
    try {
      const id = await createEstimate({
        userId: user.uid,
        status,
        clientName,
        clientAddress,
        clientPhone,
        clientEmail,
        clientFolderId,
        clientContactId,
        rows,
        selectedBodyPaint: bodyPaintId,
        selectedTrimPaint: trimPaintId,
        selectedAccentPaint: accentPaintId,
        selectedStainPaint: stainPaintId,
        scopeProject,
        scopePrepWork,
        scopePainting,
        scopeCleanUp,
        scopeWalkThrough,
        scopePaintProducts,
        totalColors,
        totalCoats,
        photoUrls: [],
      })
      router.push(`/estimates/${id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loadingSettings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</a>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave('sent')}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & Send'}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">New Estimate</h1>

        {/* ── Client Info ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Client Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="John Smith"
                className="input"
              />
            </Field>
            <Field label="Address">
              <input
                type="text"
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
                placeholder="123 Main St, City, WA 98000"
                className="input"
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                placeholder="253-555-0100"
                className="input"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="client@email.com"
                className="input"
              />
            </Field>
            <Field label="Folder ID">
              <input
                type="text"
                value={clientFolderId}
                onChange={e => setClientFolderId(e.target.value)}
                placeholder="Folder ID"
                className="input"
              />
            </Field>
            <Field label="Contact ID">
              <input
                type="text"
                value={clientContactId}
                onChange={e => setClientContactId(e.target.value)}
                placeholder="Contact ID"
                className="input"
              />
            </Field>
          </div>
        </section>

        {/* ── Paint Selections ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Paint Selections</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <PaintSelect label="Body" value={bodyPaintId} onChange={setBodyPaintId} products={paintProducts} />
            <PaintSelect label="Trim" value={trimPaintId} onChange={setTrimPaintId} products={paintProducts} />
            <PaintSelect label="Accent" value={accentPaintId} onChange={setAccentPaintId} products={paintProducts} />
            <PaintSelect label="Stain" value={stainPaintId} onChange={setStainPaintId} products={paintProducts} />
          </div>
        </section>

        {/* ── Measurements ──────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Measurements</h2>
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left font-medium text-gray-500 pb-2 pr-3 min-w-[220px]">Application</th>
                  <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Front</th>
                  <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Right</th>
                  <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Back</th>
                  <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Left</th>
                  <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Total</th>
                  <th className="text-right font-medium text-gray-500 pb-2 pl-2 w-20">Hours</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => {
                  const app = appMap.get(row.applicationKey)
                  const total = row.front + row.right + row.back + row.left
                  const hours = app ? total * app.converter : 0
                  return (
                    <tr key={row.id} className="group">
                      <td className="py-1.5 pr-3">
                        <select
                          value={row.applicationKey}
                          onChange={e => updateRow(row.id, 'applicationKey', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— Select —</option>
                          {groupedApps.map(group => (
                            <optgroup key={group.label} label={group.label}>
                              {group.options.map(opt => (
                                <option key={opt.uniqueKey} value={opt.uniqueKey}>
                                  {opt.label} ({opt.unitLabel})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      {(['front', 'right', 'back', 'left'] as const).map(side => (
                        <td key={side} className="py-1.5 px-2">
                          <input
                            type="number"
                            min={0}
                            value={row[side] || ''}
                            onChange={e => updateRow(row.id, side, parseFloat(e.target.value) || 0)}
                            className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="py-1.5 px-2 text-right font-medium text-gray-700 tabular-nums">
                        {total > 0 ? total.toLocaleString() : '—'}
                      </td>
                      <td className="py-1.5 pl-2 text-right font-medium text-gray-700 tabular-nums">
                        {hours > 0 ? fmtHrs(hours) : '—'}
                      </td>
                      <td className="py-1.5 pl-1">
                        {rows.length > 1 && (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                            title="Remove row"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Summary ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Estimate Summary</h2>
          {totals ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Hours */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Hours</p>
                <SummaryRow label="Prep Hours"        value={fmtHrs(totals.prepHours) + ' hrs'} />
                <SummaryRow label="Production Hours"  value={fmtHrs(totals.productionHours) + ' hrs'} />
                <SummaryRow label="Cleanup Hours"     value={fmtHrs(totals.cleanupHours) + ' hrs'} />
                <SummaryRow label="Total Hours" value={fmtHrs(totals.totalHours) + ' hrs'} bold />
              </div>

              {/* Paint */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Paint</p>
                {totals.body.gallons > 0   && <SummaryRow label={`Body (${bodyPaint.name || 'n/a'})`}   value={`${fmtGal(totals.body.gallons)} gal — ${fmt(totals.body.cost)}`} />}
                {totals.trim.gallons > 0   && <SummaryRow label={`Trim (${trimPaint.name || 'n/a'})`}   value={`${fmtGal(totals.trim.gallons)} gal — ${fmt(totals.trim.cost)}`} />}
                {totals.accent.gallons > 0 && <SummaryRow label={`Accent (${accentPaint.name || 'n/a'})`} value={`${fmtGal(totals.accent.gallons)} gal — ${fmt(totals.accent.cost)}`} />}
                {totals.stain.gallons > 0  && <SummaryRow label={`Stain (${stainPaint.name || 'n/a'})`}  value={`${fmtGal(totals.stain.gallons)} gal — ${fmt(totals.stain.cost)}`} />}
                <SummaryRow label="Total Paint" value={fmt(totals.totalPaintCost)} bold />
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pricing</p>
                <SummaryRow label="Labor"     value={fmt(totals.laborCost)} />
                <SummaryRow label="Paint"     value={fmt(totals.totalPaintCost)} />
                <SummaryRow label="Sundries"  value={fmt(totals.sundries)} />
                <SummaryRow label="L&amp;M"   value={fmt(totals.landm)} />
                <SummaryRow label={`Markup (${(markup * 100).toFixed(0)}%)`} value="" />
                <div className="border-t border-gray-200 pt-2 space-y-1.5">
                  <SummaryRow label="Subtotal"   value={fmt(totals.subtotal)} bold />
                  <SummaryRow label="10% Off"    value={fmt(totals.tenPercentOff)} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Add measurement rows above to see the estimate.</p>
          )}
        </section>

        {/* ── Scope of Work ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Scope of Work</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project Description">
              <textarea rows={3} value={scopeProject} onChange={e => setScopeProject(e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Prep Work">
              <textarea rows={6} value={scopePrepWork} onChange={e => setScopePrepWork(e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Painting">
              <textarea rows={6} value={scopePainting} onChange={e => setScopePainting(e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Clean Up">
              <textarea rows={4} value={scopeCleanUp} onChange={e => setScopeCleanUp(e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Walk Through">
              <textarea rows={3} value={scopeWalkThrough} onChange={e => setScopeWalkThrough(e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Paint Products">
              <textarea rows={3} value={scopePaintProducts} onChange={e => setScopePaintProducts(e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Total Colors">
              <input type="text" value={totalColors} onChange={e => setTotalColors(e.target.value)} className="input" />
            </Field>
            <Field label="Total Coats">
              <input type="text" value={totalCoats} onChange={e => setTotalCoats(e.target.value)} className="input" />
            </Field>
          </div>
        </section>

        {/* ── Bottom save ───────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pb-10">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave('sent')}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

function PaintSelect({
  label,
  value,
  onChange,
  products,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  products: PaintProduct[]
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input"
      >
        <option value="">— None —</option>
        {products.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </Field>
  )
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      <span dangerouslySetInnerHTML={{ __html: label }} />
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
