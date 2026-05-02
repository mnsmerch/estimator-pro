'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getSettingsDoc } from '@/lib/firebase/settings'
import { createEstimate, updateEstimate } from '@/lib/firebase/estimates'
import { uploadPhoto, deletePhoto } from '@/lib/firebase/storage'
import { buildApplicationList, CATEGORY_ORDER } from '@/lib/applicationList'
import { calcEstimate, calcMarkup, calcPaintCost } from '@/lib/estimateEngine'
import { SCOPE_DEFAULTS } from '@/types/estimate'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
} from '@/lib/defaultSettings'
import type { BusinessRules, ProductionConstants, PaintProduct, ProductionRates } from '@/types/settings'
import type { EstimateData, EstimateRow, WoodReplacementRow, CustomItem } from '@/types/estimate'

// ─── helpers ──────────────────────────────────────────────────────────────────

function newRow(applicationKey = ''): EstimateRow {
  return { id: crypto.randomUUID(), applicationKey, front: 0, right: 0, back: 0, left: 0 }
}

function newWoodRow(): WoodReplacementRow {
  return { id: crypto.randomUUID(), itemKey: '', front: 0, right: 0, back: 0, left: 0 }
}

function newCustomItem(): CustomItem {
  return { id: crypto.randomUUID(), description: '', price: 0 }
}

const WOOD_ITEMS: { key: string; label: string }[] = [
  { key: 'trim1Story',          label: '1st Story Trim' },
  { key: 'trim2Story',          label: '2nd Story Trim' },
  { key: 'regularSiding1Story', label: 'Regular Siding – 1st Story' },
  { key: 'regularSiding2Story', label: 'Regular Siding – 2nd Story' },
  { key: 'cementFiber1Story',   label: 'Cement Fiber – 1st Story' },
  { key: 'cementFiber2Story',   label: 'Cement Fiber – 2nd Story' },
  { key: 'doorFrame',           label: 'Door Frame (each)' },
  { key: 'fascia1Story',        label: 'Fascia – 1st Story' },
  { key: 'fascia2Story',        label: 'Fascia – 2nd Story' },
  { key: 'fascia1StoryGutter',  label: 'Fascia – 1st Story w/ Gutter' },
  { key: 'fascia2StoryGutter',  label: 'Fascia – 2nd Story w/ Gutter' },
  { key: 'railings',            label: 'Railings' },
  { key: 'eaveSoffit1Story',    label: 'Eave / Soffit – 1st Story' },
  { key: 'eaveSoffit2Story',    label: 'Eave / Soffit – 2nd Story' },
  { key: 'hardieBoard',         label: 'Hardie Board (SqFt)' },
]

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

const PAINT_BRANDS = [
  { key: 'superPaint',  label: 'Super Paint',          bodyId: 'sw-super-paint-flat',  trimId: 'sw-super-paint-satin',  accentId: 'sw-super-paint-flat',  stainId: 'sw-super-deck-stain' },
  { key: 'duration',    label: 'Duration',              bodyId: 'sw-duration-flat',     trimId: 'sw-duration-satin',     accentId: 'sw-super-paint-flat',  stainId: 'sw-super-deck-stain' },
  { key: 'emerald',     label: 'Emerald',               bodyId: 'sw-emerald-flat',      trimId: 'sw-emerald-satin',      accentId: 'sw-super-paint-flat',  stainId: 'sw-super-deck-stain' },
  { key: 'emeraldRR',   label: 'Emerald Rain Refresh',  bodyId: 'sw-emerald-rr-flat',   trimId: 'sw-emerald-rr-satin',   accentId: 'sw-super-paint-flat',  stainId: 'sw-super-deck-stain' },
]

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtCents(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtHrs(n: number) {
  // Match Google Sheet precision — up to 10 decimal places, trailing zeros removed
  return parseFloat(n.toFixed(10)).toString()
}

// Prep and Cleanup hours rounded to tenths (e.g. 0.3666... → 0.4)
function fmtHrsTenths(n: number) {
  return n.toFixed(1)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EstimateFormProps {
  /** When provided we're editing an existing estimate */
  estimateId?: string
  initialData?: EstimateData
}

export default function EstimateForm({ estimateId, initialData }: EstimateFormProps) {
  const isEdit = !!estimateId
  const { user } = useAuth()
  const router = useRouter()

  // Settings
  const [rules, setRules]             = useState<BusinessRules>(DEFAULT_BUSINESS_RULES)
  const [constants, setConstants]     = useState<ProductionConstants>(DEFAULT_PRODUCTION_CONSTANTS)
  const [paintProducts, setPaintProducts] = useState<PaintProduct[]>(DEFAULT_PAINT_PRODUCTS)
  const [rates, setRates]             = useState<ProductionRates>(DEFAULT_RATES)
  const [loadingSettings, setLoadingSettings] = useState(true)

  // Client info — seed from initialData if editing
  const [clientName,      setClientName]      = useState(initialData?.clientName      ?? '')
  const [clientAddress,   setClientAddress]   = useState(initialData?.clientAddress   ?? '')
  const [clientPhone,     setClientPhone]     = useState(initialData?.clientPhone     ?? '')
  const [clientEmail,     setClientEmail]     = useState(initialData?.clientEmail     ?? '')
  const [clientFolderId,  setClientFolderId]  = useState(initialData?.clientFolderId  ?? '')
  const [clientContactId, setClientContactId] = useState(initialData?.clientContactId ?? '')

  // Rows
  const [rows, setRows] = useState<EstimateRow[]>(() =>
    initialData?.rows?.length
      ? initialData.rows
      : DEFAULT_ROW_KEYS.map(k => newRow(k))
  )

  // Wood replacement add-on
  const [woodRows, setWoodRows] = useState<WoodReplacementRow[]>(() =>
    initialData?.woodReplacementRows?.length
      ? initialData.woodReplacementRows
      : [newWoodRow(), newWoodRow(), newWoodRow()]
  )
  const [woodOpen, setWoodOpen] = useState(initialData?.woodReplacementOpen ?? false)

  // Custom items add-on
  const [customItems, setCustomItems] = useState<CustomItem[]>(() =>
    initialData?.customItems?.length
      ? initialData.customItems
      : [newCustomItem()]
  )
  const [customOpen, setCustomOpen] = useState(initialData?.customItemsOpen ?? false)

  // Paint
  const [selectedBrand,        setSelectedBrand]        = useState(initialData?.selectedBrand        ?? 'superPaint')
  const [bodyPaintId,          setBodyPaintId]           = useState(initialData?.selectedBodyPaint    ?? PAINT_BRANDS[0].bodyId)
  const [trimPaintId,          setTrimPaintId]           = useState(initialData?.selectedTrimPaint    ?? PAINT_BRANDS[0].trimId)
  const [accentPaintId,        setAccentPaintId]         = useState(initialData?.selectedAccentPaint  ?? PAINT_BRANDS[0].accentId)
  const [stainPaintId,         setStainPaintId]          = useState(initialData?.selectedStainPaint   ?? PAINT_BRANDS[0].stainId)
  const [manualPaintAProductId, setManualPaintAProductId] = useState(initialData?.manualPaintAProductId ?? '')
  const [manualPaintAGallons,   setManualPaintAGallons]   = useState(initialData?.manualPaintAGallons   ?? 0)
  const [manualPaintBProductId, setManualPaintBProductId] = useState(initialData?.manualPaintBProductId ?? '')
  const [manualPaintBGallons,   setManualPaintBGallons]   = useState(initialData?.manualPaintBGallons   ?? 0)

  // Scope
  const [scopeProject,       setScopeProject]       = useState(initialData?.scopeProject       ?? SCOPE_DEFAULTS.scopeProject)
  const [scopePrepWork,      setScopePrepWork]       = useState(initialData?.scopePrepWork      ?? SCOPE_DEFAULTS.scopePrepWork)
  const [scopePainting,      setScopePainting]       = useState(initialData?.scopePainting      ?? SCOPE_DEFAULTS.scopePainting)
  const [scopeCleanUp,       setScopeCleanUp]        = useState(initialData?.scopeCleanUp       ?? SCOPE_DEFAULTS.scopeCleanUp)
  const [scopeWalkThrough,   setScopeWalkThrough]    = useState(initialData?.scopeWalkThrough   ?? SCOPE_DEFAULTS.scopeWalkThrough)
  const [scopePaintProducts, setScopePaintProducts]  = useState(initialData?.scopePaintProducts ?? SCOPE_DEFAULTS.scopePaintProducts)
  const [totalColors,        setTotalColors]         = useState(initialData?.totalColors        ?? '')
  const [totalCoats,         setTotalCoats]          = useState(initialData?.totalCoats         ?? '')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialData?.photoUrls ?? [])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Load settings
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

  const applications = useMemo(() => buildApplicationList(rates), [rates])
  const appMap = useMemo(() => new Map(applications.map(a => [a.uniqueKey, a])), [applications])
  const groupedApps = useMemo(() => CATEGORY_ORDER.map(catLabel => ({
    label: catLabel,
    options: applications.filter(a => a.categoryLabel === catLabel),
  })), [applications])

  const emptyPaint: PaintProduct = { id: '', name: '', singleGallon: 0, fiveGallon: 0, coverage: 400 }
  const bodyPaint   = paintProducts.find(p => p.id === bodyPaintId)   ?? emptyPaint
  const trimPaint   = paintProducts.find(p => p.id === trimPaintId)   ?? emptyPaint
  const accentPaint = paintProducts.find(p => p.id === accentPaintId) ?? emptyPaint
  const stainPaint  = paintProducts.find(p => p.id === stainPaintId)  ?? emptyPaint

  const totals = useMemo(() => {
    const validRows = rows.filter(r => r.applicationKey !== '')
    if (validRows.length === 0) return null
    return calcEstimate(validRows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint)
  }, [rows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint])

  const markup = useMemo(() => calcMarkup(rules), [rules])

  const woodTotal = useMemo(() => {
    if (!woodOpen || markup <= 0) return 0
    return woodRows.reduce((sum, row) => {
      if (!row.itemKey) return sum
      const rate = (rates.woodReplacement as Record<string, number>)[row.itemKey] ?? 0
      const total = row.front + row.right + row.back + row.left
      return sum + (total * rate / markup)
    }, 0)
  }, [woodRows, woodOpen, rates, markup])

  const customTotal = useMemo(() => {
    if (!customOpen) return 0
    return customItems.reduce((sum, item) => {
      if (!item.description && !item.price) return sum
      return sum + (item.price || 0)
    }, 0)
  }, [customItems, customOpen])

  function selectBrand(key: string) {
    const brand = PAINT_BRANDS.find(b => b.key === key)
    if (!brand) return
    setSelectedBrand(key)
    setBodyPaintId(brand.bodyId)
    setTrimPaintId(brand.trimId)
    setAccentPaintId(brand.accentId)
    setStainPaintId(brand.stainId)
  }

  const addRow       = useCallback(() => setRows(r => [...r, newRow()]), [])
  const removeRow    = useCallback((id: string) => setRows(r => r.filter(row => row.id !== id)), [])
  const addWoodRow   = useCallback(() => setWoodRows(r => [...r, newWoodRow()]), [])
  const removeWoodRow = useCallback((id: string) => setWoodRows(r => r.filter(row => row.id !== id)), [])
  const updateWoodRow = useCallback((id: string, field: keyof WoodReplacementRow, value: string | number) => {
    setWoodRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row))
  }, [])
  const addCustomItem    = useCallback(() => setCustomItems(r => [...r, newCustomItem()]), [])
  const removeCustomItem = useCallback((id: string) => setCustomItems(r => r.filter(i => i.id !== id)), [])
  const updateCustomItem = useCallback((id: string, field: keyof CustomItem, value: string | number) => {
    setCustomItems(r => r.map(i => i.id === id ? { ...i, [field]: value } : i))
  }, [])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return
    const remaining = 20 - photoUrls.length
    const files = Array.from(e.target.files).slice(0, remaining)
    if (!files.length) return
    setUploadingPhotos(true)
    setUploadError(null)
    try {
      const urls = await Promise.all(files.map(f => uploadPhoto(user.uid, f)))
      setPhotoUrls(prev => [...prev, ...urls].slice(0, 20))
    } catch (err: unknown) {
      console.error('Photo upload failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(msg)
    } finally {
      setUploadingPhotos(false)
      e.target.value = ''
    }
  }

  async function handleRemovePhoto(url: string) {
    setPhotoUrls(prev => prev.filter(u => u !== url))
    await deletePhoto(url)
  }
  const updateRow = useCallback((id: string, field: keyof EstimateRow, value: string | number) => {
    setRows(r => {
      const updated = r.map(row => row.id === id ? { ...row, [field]: value } : row)
      const measurementFields: (keyof EstimateRow)[] = ['front', 'right', 'back', 'left']
      if (measurementFields.includes(field)) {
        const changedRow = updated.find(row => row.id === id)
        if (changedRow?.applicationKey === 'bodyApplication.sidingSpray') {
          const firstSidingIdx = updated.findIndex(row => row.applicationKey === 'bodyApplication.sidingSpray')
          if (updated[firstSidingIdx]?.id === id) {
            return updated.map(row => {
              if (row.id === id) return row
              if (row.applicationKey === 'prepWork.powerWash' ||
                  row.applicationKey === 'bodyApplication.sidingSpray') {
                return { ...row, [field]: value }
              }
              return row
            })
          }
        }
      }
      return updated
    })
  }, [])

  async function handleSave(status: 'draft' | 'sent') {
    if (!user) return
    setSaving(true)
    setSaveError(false)
    const payload = {
      userId: user.uid,
      status,
      clientName, clientAddress, clientPhone, clientEmail,
      clientFolderId, clientContactId,
      rows,
      woodReplacementRows: woodRows,
      woodReplacementOpen: woodOpen,
      customItems,
      customItemsOpen: customOpen,
      selectedBrand,
      selectedBodyPaint:   bodyPaintId,
      selectedTrimPaint:   trimPaintId,
      selectedAccentPaint: accentPaintId,
      selectedStainPaint:  stainPaintId,
      manualPaintAProductId, manualPaintAGallons,
      manualPaintBProductId, manualPaintBGallons,
      scopeProject, scopePrepWork, scopePainting,
      scopeCleanUp, scopeWalkThrough, scopePaintProducts,
      totalColors, totalCoats,
      photoUrls,
    }
    try {
      if (isEdit && estimateId) {
        await updateEstimate(estimateId, payload)
        router.push(`/estimates/${estimateId}`)
      } else {
        const id = await createEstimate(payload)
        router.push(`/estimates/${id}`)
      }
    } catch (err) {
      console.error('Save failed:', err)
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  async function saveQuiet(): Promise<void> {
    if (!user) return
    const payload = {
      userId: user.uid,
      status: (initialData?.status ?? 'draft') as 'draft' | 'sent',
      clientName, clientAddress, clientPhone, clientEmail,
      clientFolderId, clientContactId,
      rows,
      woodReplacementRows: woodRows,
      woodReplacementOpen: woodOpen,
      customItems,
      customItemsOpen: customOpen,
      selectedBrand,
      selectedBodyPaint:   bodyPaintId,
      selectedTrimPaint:   trimPaintId,
      selectedAccentPaint: accentPaintId,
      selectedStainPaint:  stainPaintId,
      manualPaintAProductId, manualPaintAGallons,
      manualPaintBProductId, manualPaintBGallons,
      scopeProject, scopePrepWork, scopePainting,
      scopeCleanUp, scopeWalkThrough, scopePaintProducts,
      totalColors, totalCoats,
      photoUrls,
    }
    if (isEdit && estimateId) {
      await updateEstimate(estimateId, payload)
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
          <a href="/estimates" className="text-sm text-gray-500 hover:text-gray-800">← Estimates</a>
          {saveError && <span className="text-sm text-red-600">Error saving. Try again.</span>}
          {isEdit && estimateId && (
            <button
              onClick={async () => {
                await saveQuiet()
                window.open(`/estimates/${estimateId}/proposal`, '_blank')
              }}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-green-600 text-green-700 bg-white hover:bg-green-50 disabled:opacity-50"
            >
              Generate Estimate ↗
            </button>
          )}
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
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? `Edit — ${initialData?.clientName || 'Estimate'}` : 'New Estimate'}
        </h1>

        {/* ── Client Info ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Client Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="John Smith" className="input" />
            </Field>
            <Field label="Address">
              <input type="text" value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="123 Main St, City, WA 98000" className="input" />
            </Field>
            <Field label="Phone">
              <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="253-555-0100" className="input" />
            </Field>
            <Field label="Email">
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" className="input" />
            </Field>
            <Field label="Folder ID">
              <input type="text" value={clientFolderId} onChange={e => setClientFolderId(e.target.value)} placeholder="Folder ID" className="input" />
            </Field>
            <Field label="Contact ID">
              <input type="text" value={clientContactId} onChange={e => setClientContactId(e.target.value)} placeholder="Contact ID" className="input" />
            </Field>
          </div>
        </section>

        {/* ── Measurements ──────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Measurements</h2>
            <button onClick={addRow} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800">
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
                                <option key={opt.uniqueKey} value={opt.uniqueKey}>{opt.label} ({opt.unitLabel})</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      {(['front', 'right', 'back', 'left'] as const).map(side => (
                        <td key={side} className="py-1.5 px-2">
                          <input
                            type="number" min={0}
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

        {/* ── Add Ons ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Add Ons</h2>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setWoodOpen(o => !o)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                woodOpen
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              Wood Replacement
            </button>
            <button
              onClick={() => setCustomOpen(o => !o)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                customOpen
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              Custom Item
            </button>
          </div>

          {woodOpen && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left font-medium text-gray-500 pb-2 pr-3 min-w-[220px]">Item</th>
                      <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Front</th>
                      <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Right</th>
                      <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Back</th>
                      <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Left</th>
                      <th className="text-right font-medium text-gray-500 pb-2 px-2 w-20">Total</th>
                      <th className="text-right font-medium text-gray-500 pb-2 px-2 w-28">Cost/LnFt</th>
                      <th className="text-right font-medium text-gray-500 pb-2 pl-2 w-28">Price Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {woodRows.map(row => {
                      const rate = row.itemKey ? ((rates.woodReplacement as Record<string, number>)[row.itemKey] ?? 0) : 0
                      const total = row.front + row.right + row.back + row.left
                      const price = markup > 0 ? total * rate / markup : 0
                      return (
                        <tr key={row.id} className="group">
                          <td className="py-1.5 pr-3">
                            <select
                              value={row.itemKey}
                              onChange={e => updateWoodRow(row.id, 'itemKey', e.target.value)}
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— Wood Replacement —</option>
                              {WOOD_ITEMS.map(item => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                              ))}
                            </select>
                          </td>
                          {(['front', 'right', 'back', 'left'] as const).map(side => (
                            <td key={side} className="py-1.5 px-2">
                              <input
                                type="number" min={0}
                                value={row[side] || ''}
                                onChange={e => updateWoodRow(row.id, side, parseFloat(e.target.value) || 0)}
                                className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                          ))}
                          <td className="py-1.5 px-2 text-right font-medium text-gray-700 tabular-nums">
                            {total > 0 ? total : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">
                            {row.itemKey ? fmtCents(rate) : '—'}
                          </td>
                          <td className="py-1.5 pl-2 text-right font-medium text-gray-700 tabular-nums">
                            {fmtCents(price)}
                          </td>
                          <td className="py-1.5 pl-1">
                            <button
                              onClick={() => removeWoodRow(row.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                              title="Remove row"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td colSpan={7} className="pt-3 pr-3 text-right font-medium text-gray-500">Price</td>
                      <td className="pt-3 pl-2 text-right font-bold text-gray-900 tabular-nums">
                        {fmtCents(woodTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button
                onClick={addWoodRow}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Row
              </button>
            </div>
          )}

          {customOpen && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left font-medium text-gray-500 pb-2 pr-3">Description</th>
                      <th className="text-right font-medium text-gray-500 pb-2 pl-2 w-36">Price</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customItems.map(item => (
                      <tr key={item.id} className="group">
                        <td className="py-1.5 pr-3">
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateCustomItem(item.id, 'description', e.target.value)}
                            placeholder="e.g. Exterior door replacement"
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            type="number" min={0}
                            value={item.price || ''}
                            onChange={e => updateCustomItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-1.5 pl-1">
                          <button
                            onClick={() => removeCustomItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                            title="Remove item"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="pt-3 pr-3 text-right font-medium text-gray-500">Total</td>
                      <td className="pt-3 pl-2 text-right font-bold text-gray-900 tabular-nums">
                        {fmtCents(customTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button
                onClick={addCustomItem}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Item
              </button>
            </div>
          )}
        </section>

        {/* ── Photos ────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">Photos</h2>
              <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {photoUrls.length} / 20
              </span>
            </div>
            {photoUrls.length < 20 && (
              <label className={`flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none ${
                uploadingPhotos ? 'text-gray-400 pointer-events-none' : 'text-blue-600 hover:text-blue-800'
              }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {uploadingPhotos ? 'Uploading…' : 'Add Photos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={uploadingPhotos}
                  onChange={handlePhotoUpload}
                />
              </label>
            )}
          </div>

          {uploadError && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Upload failed: {uploadError}
            </div>
          )}

          {photoUrls.length === 0 ? (
            <label className={`flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-10 cursor-pointer transition-colors ${
              uploadingPhotos ? 'opacity-50 pointer-events-none' : 'hover:border-blue-300 hover:bg-blue-50'
            }`}>
              <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              <p className="text-sm text-gray-400">Click to upload photos</p>
              <p className="text-xs text-gray-300 mt-1">Up to 20 images</p>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={uploadingPhotos}
                onChange={handlePhotoUpload}
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {photoUrls.map((url, idx) => (
                <div key={url} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleRemovePhoto(url)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-black/60 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center transition-all"
                    title="Remove photo"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {photoUrls.length < 20 && (
                <label className={`aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  uploadingPhotos ? 'opacity-50 pointer-events-none' : 'hover:border-blue-300 hover:bg-blue-50'
                }`}>
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-xs text-gray-400 mt-1">{uploadingPhotos ? 'Uploading…' : 'Add more'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={uploadingPhotos}
                    onChange={handlePhotoUpload}
                  />
                </label>
              )}
            </div>
          )}
        </section>

        {/* ── Paint Selection ───────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Paint Selection</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {PAINT_BRANDS.map(brand => (
              <button
                key={brand.key}
                onClick={() => selectBrand(brand.key)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  selectedBrand === brand.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {brand.label}
              </button>
            ))}
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-700 text-white text-center text-sm font-bold py-2 tracking-wide">MATERIALS</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left font-medium text-gray-600 px-4 py-2">Product</th>
                  <th className="text-left font-medium text-gray-600 px-3 py-2 w-28">Type</th>
                  <th className="text-right font-medium text-gray-600 px-3 py-2 w-24">Gallons</th>
                  <th className="text-right font-medium text-gray-600 px-4 py-2 w-28">Total ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <MaterialRow type="Body"       product={bodyPaint}   gallons={totals?.body.gallons   ?? 0} cost={totals?.body.cost   ?? 0} products={paintProducts} selectedId={bodyPaintId}   onProductChange={setBodyPaintId} />
                <MaterialRow type="Trim"       product={trimPaint}   gallons={totals?.trim.gallons   ?? 0} cost={totals?.trim.cost   ?? 0} products={paintProducts} selectedId={trimPaintId}   onProductChange={setTrimPaintId} />
                <MaterialRow type="Accent"     product={accentPaint} gallons={totals?.accent.gallons ?? 0} cost={totals?.accent.cost ?? 0} products={paintProducts} selectedId={accentPaintId} onProductChange={setAccentPaintId} />
                <ManualMaterialRow type="Manual A" products={paintProducts} selectedId={manualPaintAProductId} onProductChange={setManualPaintAProductId} gallons={manualPaintAGallons} onGallonsChange={setManualPaintAGallons} />
                <ManualMaterialRow type="Manual B" products={paintProducts} selectedId={manualPaintBProductId} onProductChange={setManualPaintBProductId} gallons={manualPaintBGallons} onGallonsChange={setManualPaintBGallons} />
                <MaterialRow type="Solid Stain" product={stainPaint} gallons={totals?.stain.gallons  ?? 0} cost={totals?.stain.cost  ?? 0} products={paintProducts} selectedId={stainPaintId} onProductChange={setStainPaintId} />
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={3} className="px-4 py-2 font-bold text-gray-900 text-sm">Grand Total</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900 tabular-nums">
                    {fmtCents(
                      (totals?.totalPaintCost ?? 0) +
                      manualMaterialCost(manualPaintAProductId, manualPaintAGallons, paintProducts) +
                      manualMaterialCost(manualPaintBProductId, manualPaintBGallons, paintProducts)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ── Summary ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Estimate Summary</h2>
          {totals ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Hours</p>
                <SummaryRow label="Prep Hours"       value={fmtHrsTenths(totals.prepHours) + ' hrs'} />
                <SummaryRow label="Production Hours" value={fmtHrs(totals.productionHours) + ' hrs'} />
                <SummaryRow label="Cleanup Hours"    value={fmtHrsTenths(totals.cleanupHours) + ' hrs'} />
                <SummaryRow label="Total Hours"      value={fmtHrs(totals.totalHours) + ' hrs'} bold />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Paint</p>
                {totals.body.gallons   > 0 && <SummaryRow label={`Body ${bodyPaint.name || 'n/a'}`}   value={`${Math.ceil(totals.body.gallons)} gal — ${fmtCents(totals.body.cost)}`} />}
                {totals.trim.gallons   > 0 && <SummaryRow label={`Trim ${trimPaint.name || 'n/a'}`}   value={`${Math.ceil(totals.trim.gallons)} gal — ${fmtCents(totals.trim.cost)}`} />}
                {totals.accent.gallons > 0 && <SummaryRow label={`Accent ${accentPaint.name || 'n/a'}`} value={`${Math.ceil(totals.accent.gallons)} gal — ${fmtCents(totals.accent.cost)}`} />}
                {totals.stain.gallons  > 0 && <SummaryRow label={`Stain ${stainPaint.name || 'n/a'}`}  value={`${Math.ceil(totals.stain.gallons)} gal — ${fmtCents(totals.stain.cost)}`} />}
                <SummaryRow label="Total Paint" value={fmtCents(totals.totalPaintCost)} bold />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pricing</p>
                <SummaryRow label="Labor"    value={fmtCents(totals.laborCost)} />
                <SummaryRow label="Paint"    value={fmtCents(totals.totalPaintCost)} />
                <SummaryRow label="Sundries" value={fmtCents(totals.sundries)} />
                <SummaryRow label="L&amp;M"  value={fmtCents(totals.landm)} />
                <div className="border-t border-gray-200 pt-2 space-y-1.5">
                  {(woodTotal > 0 || customTotal > 0) && <SummaryRow label="Painting Subtotal" value={fmtCents(totals.subtotal)} />}
                  {woodTotal   > 0 && <SummaryRow label="Wood Replacement" value={fmtCents(woodTotal)} />}
                  {customTotal > 0 && <SummaryRow label="Custom Items"     value={fmtCents(customTotal)} />}
                  <SummaryRow label="Subtotal" value={fmtCents(totals.subtotal + woodTotal + customTotal)} bold />
                  <SummaryRow label="10% Off"  value={fmtCents((totals.subtotal + woodTotal + customTotal) * 0.90)} />
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
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

function manualMaterialCost(productId: string, gallons: number, products: PaintProduct[]): number {
  if (!productId || gallons <= 0) return 0
  const product = products.find(p => p.id === productId)
  if (!product) return 0
  return calcPaintCost(gallons, product)
}

function MaterialRow({ type, product, gallons, cost, products, selectedId, onProductChange }: {
  type: string; product: PaintProduct; gallons: number; cost: number
  products: PaintProduct[]; selectedId: string; onProductChange: (id: string) => void
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-1.5">
        <select
          value={selectedId}
          onChange={e => onProductChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">— None —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5 text-gray-600">{type}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{gallons > 0 ? Math.ceil(gallons) : '0'}</td>
      <td className="px-4 py-1.5 text-right tabular-nums text-gray-700">{fmtCents(cost)}</td>
    </tr>
  )
}

function ManualMaterialRow({ type, products, selectedId, onProductChange, gallons, onGallonsChange }: {
  type: string; products: PaintProduct[]; selectedId: string
  onProductChange: (id: string) => void; gallons: number; onGallonsChange: (n: number) => void
}) {
  const product = products.find(p => p.id === selectedId)
  const cost = product ? calcPaintCost(gallons, product) : 0
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-1.5">
        <select
          value={selectedId}
          onChange={e => onProductChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">— None —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5 text-gray-600">{type}</td>
      <td className="px-3 py-1.5">
        <input
          type="number" min={0}
          value={gallons || ''}
          onChange={e => onGallonsChange(parseFloat(e.target.value) || 0)}
          className="w-full text-right text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
        />
      </td>
      <td className="px-4 py-1.5 text-right tabular-nums text-gray-700">{fmtCents(cost)}</td>
    </tr>
  )
}
