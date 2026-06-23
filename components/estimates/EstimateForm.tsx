'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getSettingsDoc } from '@/lib/firebase/settings'
import { createEstimate, updateEstimate, resetSignatureForChangeOrder } from '@/lib/firebase/estimates'
import { uploadPhoto, deletePhoto } from '@/lib/firebase/storage'
import { useAutoSave } from '@/lib/useAutoSave'
import AutoSaveIndicator from '@/components/AutoSaveIndicator'
import { buildApplicationList, CATEGORY_ORDER } from '@/lib/applicationList'
import type { ApplicationItem } from '@/lib/applicationList'
import { calcEstimate, calcMarkup, calcPaintCost, surfaceAreaFactor, calcStructureAddonSubtotal } from '@/lib/estimateEngine'
import { SCOPE_DEFAULTS, getDefaultScopeForBrand } from '@/types/estimate'
import type { ScopeFields, JobType } from '@/types/estimate'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
} from '@/lib/defaultSettings'
import type { BusinessRules, ProductionConstants, PaintProduct, ProductionRates } from '@/types/settings'
import type { EstimateData, EstimateRow, WoodReplacementRow, CustomItem, StructureRow, StructureAddon } from '@/types/estimate'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Best-effort parse of a freeform address into the fields WA DOR expects. */
function parseAddressForTax(fullAddress: string): { addr: string; city: string; zip: string } {
  // Match zip at END of string to avoid picking up 5-digit street numbers (e.g. 11403)
  const zipMatch  = fullAddress.match(/(\d{5}(?:-\d{4})?)\s*$/)
  const zip       = zipMatch?.[1] ?? ''
  // Split on commas or newlines; first chunk = street, second = "City, ST XXXXX"
  const parts     = fullAddress.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
  const addr      = parts[0] ?? ''
  const cityChunk = parts[1] ?? ''
  // Strip trailing state + zip from city chunk
  const city      = cityChunk.replace(/\s+[A-Z]{2}\s+[\d-]+$/, '').replace(/\s+[A-Z]{2}$/, '').trim()
  return { addr, city, zip }
}

const WA_DOR_URL = 'https://webgis.dor.wa.gov/webapi/AddressRates.aspx'

async function lookupSalesTax(fullAddress: string): Promise<number | null> {
  try {
    const { addr, city, zip } = parseAddressForTax(fullAddress)
    const params = new URLSearchParams({ output: 'text', addr, city, zip })
    const res  = await fetch(`${WA_DOR_URL}?${params}`)
    if (!res.ok) return null
    const text = await res.text()
    const rateMatch = text.match(/Rate=([\d.]+)/)
    const codeMatch = text.match(/ResultCode=(\d+)/)
    const rate       = rateMatch ? parseFloat(rateMatch[1]) : null
    const resultCode = codeMatch ? parseInt(codeMatch[1])   : null
    if (rate === null || resultCode === null || resultCode >= 6) return null
    return rate
  } catch {
    return null
  }
}

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

const DECK_DEFAULTS: string[] = [
  'prepWork.powerWash',
  'prepWork.lightSand',
  'staining.deckSolidStain',
  'staining.stainRailings',
  'staining.stairsSolidStain',
  'prepWork.manualPrepHours',
]

const PERGOLA_DEFAULTS: string[] = [
  'prepWork.powerWash',
  'prepWork.lightSand',
  'bodyApplication.sidingBrush',
  'staining.stainTrim',
  'staining.stainPosts',
  'prepWork.manualPrepHours',
]

const FENCE_DEFAULTS: string[] = [
  'prepWork.powerWash',
  'prepWork.lightSand',
  'staining.fenceFlatSpray',
  'staining.fenceBeamsSpray',
  'staining.stainPosts',
  'prepWork.manualPrepHours',
]

const SHED_DEFAULTS: string[] = [
  'prepWork.powerWash',
  'prepWork.lightSand',
  'bodyApplication.sidingSpray',
  'fascia.fascia1Story',
  'railings.railings1Color',
  'prepWork.manualPrepHours',
]

function newStructureRow(applicationKey = ''): StructureRow {
  return { id: crypto.randomUUID(), applicationKey, amount: 0 }
}

function makeStructureAddon(defaultKeys: string[]): StructureAddon {
  return { enabled: false, rows: defaultKeys.map(k => newStructureRow(k)), paintProductId: '' }
}

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

// ─── Structure Table subcomponent ─────────────────────────────────────────────

interface StructureTableProps {
  addon:          StructureAddon
  onChange:       (a: StructureAddon) => void
  appMap:         Map<string, ApplicationItem>
  groupedApps:    { label: string; options: ApplicationItem[] }[]
  paintProducts:  PaintProduct[]
  rules:          BusinessRules
  constants:      ProductionConstants
  setupFraction?: number
}

function StructureTable({ addon, onChange, appMap, groupedApps, paintProducts, rules, constants, setupFraction = 0 }: StructureTableProps) {
  function updateRow(id: string, field: keyof StructureRow, value: string | number) {
    onChange({ ...addon, rows: addon.rows.map(r => r.id === id ? { ...r, [field]: value } : r) })
  }
  function addRow() {
    onChange({ ...addon, rows: [...addon.rows, newStructureRow()] })
  }
  function removeRow(id: string) {
    onChange({ ...addon, rows: addon.rows.filter(r => r.id !== id) })
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-sm font-medium text-gray-700">Paint Product:</span>
        <select
          value={addon.paintProductId}
          onChange={e => onChange({ ...addon, paintProductId: e.target.value })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[200px]"
        >
          <option value="">— Select Product —</option>
          {paintProducts.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left font-medium text-gray-500 pb-2 pr-3 min-w-[220px]">Application</th>
              <th className="text-right font-medium text-gray-500 pb-2 px-2 w-28">Amount</th>
              <th className="text-left font-medium text-gray-500 pb-2 px-2 w-16">Type</th>
              <th className="text-right font-medium text-gray-500 pb-2 pl-2 w-24">Hours</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {addon.rows.map(row => {
              const app = appMap.get(row.applicationKey)
              const hours = app && row.amount > 0 ? row.amount * app.converter : 0
              return (
                <tr key={row.id} className="group">
                  <td className="py-1.5 pr-3">
                    <select
                      value={row.applicationKey}
                      onChange={e => updateRow(row.id, 'applicationKey', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                  <td className="py-1.5 px-2">
                    <input
                      type="number" min={0}
                      value={row.amount || ''}
                      onChange={e => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-sm text-gray-500">
                    {app?.unitLabel ?? '—'}
                  </td>
                  <td className="py-1.5 pl-2 text-right font-medium text-gray-700 tabular-nums">
                    {hours > 0 ? fmtHrs(hours) : '—'}
                  </td>
                  <td className="py-1.5 pl-1">
                    {addon.rows.length > 1 && (
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
          <tfoot>
            {(() => {
              const raw = addon.rows.reduce((s, r) => {
                const app = appMap.get(r.applicationKey)
                return s + (app && r.amount > 0 ? r.amount * app.converter : 0)
              }, 0)
              const totalHours = raw + raw * setupFraction

              const labor    = totalHours * rules.wage * rules.payrollBurden
              const sundries = totalHours * constants.sundriesPerHour

              // Paint: accumulate sqft by application method
              const paintProduct = paintProducts.find(p => p.id === addon.paintProductId)
              let spraySqft = 0, brushRollSqft = 0, stainSqft = 0
              for (const r of addon.rows) {
                if (r.amount <= 0) continue
                const app = appMap.get(r.applicationKey)
                if (!app) continue
                const factor = surfaceAreaFactor(app, constants)
                if (factor <= 0) continue
                const sqft = r.amount * factor
                if (app.categoryKey === 'staining')             stainSqft     += sqft
                else if (app.categoryKey === 'bodyApplication') spraySqft     += sqft
                else                                            brushRollSqft += sqft
              }
              const paintGallons = paintProduct && paintProduct.coverage > 0
                ? (spraySqft * constants.paintCoverageSpray
                   + brushRollSqft * constants.paintCoverageBrushRoll
                   + stainSqft * constants.stainCoverage) / paintProduct.coverage
                : 0
              const paintCost = paintProduct ? calcPaintCost(paintGallons, paintProduct) : 0

              const landm   = labor + paintCost + sundries
              const markup  = calcMarkup(rules)
              const raw2    = markup > 0 ? (landm / markup) / (1 - rules.salesDiscount) : 0
              const subtotal = rules.salesTax === 0 ? Math.round(raw2) : raw2

              const rows2 = [
                { label: 'Labor',       value: labor,    },
                { label: 'Paint',       value: paintCost },
                { label: 'Sundries',    value: sundries  },
                { label: 'Labor & Mat', value: landm,    bold: true },
                { label: 'Subtotal',    value: subtotal, bold: true, accent: true },
              ]
              return (
                <>
                  <tr className="border-t border-gray-200">
                    <td colSpan={3} className="pt-3 pr-3 text-right font-medium text-gray-500">Total Hours</td>
                    <td className="pt-3 pl-2 text-right font-bold text-gray-900 tabular-nums">
                      {setupFraction > 0 ? fmtHrsTenths(totalHours) : fmtHrs(totalHours)}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 pr-3 text-right font-medium text-gray-500">Paint Gallons</td>
                    <td className="pt-1 pl-2 text-right font-medium text-gray-900 tabular-nums">
                      {paintGallons > 0 ? Math.ceil(paintGallons) + ' gal' : '—'}
                    </td>
                    <td />
                  </tr>
                  {rows2.map(({ label, value, bold, accent }) => (
                    <tr key={label}>
                      <td colSpan={3} className="pt-1 pr-3 text-right font-medium text-gray-500">{label}</td>
                      <td className={`pt-1 pl-2 text-right tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${accent ? 'text-brand-700' : 'text-gray-900'}`}>
                        {fmtCents(value)}
                      </td>
                      <td />
                    </tr>
                  ))}
                </>
              )
            })()}
          </tfoot>
        </table>
      </div>
      {/* Mobile */}
      <div className="sm:hidden space-y-3">
        {addon.rows.map(row => {
          const app = appMap.get(row.applicationKey)
          const hours = app && row.amount > 0 ? row.amount * app.converter : 0
          return (
            <div key={row.id} className="border border-gray-200 rounded-xl p-3 space-y-2.5 bg-gray-50">
              <select
                value={row.applicationKey}
                onChange={e => updateRow(row.id, 'applicationKey', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount ({app?.unitLabel ?? '—'})</label>
                  <input
                    type="number" min={0}
                    value={row.amount || ''}
                    onChange={e => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)}
                    className="w-full text-right rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="text-xs text-gray-500 pb-2">
                  Hrs: <span className="font-medium text-gray-700">{hours > 0 ? fmtHrs(hours) : '—'}</span>
                </div>
                {addon.rows.length > 1 && (
                  <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600 p-1 pb-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <button
        onClick={addRow}
        className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Row
      </button>
    </div>
  )
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

  // Google Places Autocomplete
  const addressInputRef = useRef<HTMLInputElement>(null)
  const acInitialized   = useRef(false)

  const initAutocomplete = useCallback(() => {
    if (acInitialized.current) return
    const input = addressInputRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    if (!input || !g?.maps?.places) return
    acInitialized.current = true
    const ac = new g.maps.places.Autocomplete(input, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['formatted_address'],
    })
    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (place?.formatted_address) {
        // Google Places appends ", USA" — strip it so the address stays clean
        const addr = place.formatted_address.replace(/,?\s*(?:USA|United States)\s*$/i, '').trim()
        setClientAddress(addr)
      }
    })
  }, [])

  // Load the Google Maps script once
  useEffect(() => {
    const MAPS_API_KEY = 'AIzaSyC6B8UH_okz_x4sN2lZEIFscWc3zz_GqY8'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) {
      initAutocomplete()
      return
    }
    if (document.querySelector('script[data-gmaps]')) {
      window.addEventListener('gmaps-ready', initAutocomplete, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`
    script.async = true
    script.dataset.gmaps = '1'
    script.onload = () => {
      window.dispatchEvent(new Event('gmaps-ready'))
      initAutocomplete()
    }
    document.head.appendChild(script)
  }, [initAutocomplete])

  // For existing estimates the form is hidden behind a loading spinner until
  // settings load — the ref is null at mount time. Retry once settings are done.
  useEffect(() => {
    if (!loadingSettings) initAutocomplete()
  }, [loadingSettings, initAutocomplete])
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

  // Structure add-ons
  const [deckAddons, setDeckAddons] = useState<StructureAddon[]>(() => {
    if (initialData?.deckAddons?.length) return initialData.deckAddons
    if (initialData?.deckAddon) return [initialData.deckAddon]
    return [makeStructureAddon(DECK_DEFAULTS)]
  })
  const [pergolaAddon, setPergolaAddon] = useState<StructureAddon>(() => initialData?.pergolaAddon ?? makeStructureAddon(PERGOLA_DEFAULTS))
  const [fenceAddon,   setFenceAddon]   = useState<StructureAddon>(() => initialData?.fenceAddon   ?? makeStructureAddon(FENCE_DEFAULTS))
  const [shedAddon,    setShedAddon]    = useState<StructureAddon>(() => initialData?.shedAddon    ?? makeStructureAddon(SHED_DEFAULTS))

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

  // Scope — all fields stored per brand
  const [scopeByBrand, setScopeByBrand] = useState<Record<string, ScopeFields>>(() => {
    const defaults = Object.fromEntries(
      PAINT_BRANDS.map(b => [b.key, getDefaultScopeForBrand(b.key)])
    )
    if (!initialData) return defaults
    if (initialData.scopeByBrand) {
      // Already per-brand — merge with defaults so any new brands get their defaults
      return { ...defaults, ...initialData.scopeByBrand }
    }
    // Migration: existing estimate without scopeByBrand — seed active brand with saved values
    const activeBrand = initialData.selectedBrand ?? 'superPaint'
    const existing: ScopeFields = {
      scopeProject:       initialData.scopeProject       ?? SCOPE_DEFAULTS.scopeProject,
      scopePrepWork:      initialData.scopePrepWork      ?? SCOPE_DEFAULTS.scopePrepWork,
      scopePainting:      initialData.scopePainting      ?? SCOPE_DEFAULTS.scopePainting,
      scopeCleanUp:       initialData.scopeCleanUp       ?? SCOPE_DEFAULTS.scopeCleanUp,
      scopeWalkThrough:   initialData.scopeWalkThrough   ?? SCOPE_DEFAULTS.scopeWalkThrough,
      scopePaintProducts: initialData.scopePaintProductsByBrand?.[activeBrand] ?? initialData.scopePaintProducts ?? getDefaultScopeForBrand(activeBrand).scopePaintProducts,
      totalColors:        initialData.totalColors        ?? '',
      totalCoats:         initialData.totalCoats         ?? '',
    }
    return { ...defaults, [activeBrand]: existing }
  })

  function updateScope(field: keyof ScopeFields, value: string) {
    setScopeByBrand(prev => {
      if (field === 'scopePaintProducts') {
        return {
          ...prev,
          [selectedBrand]: { ...(prev[selectedBrand] ?? getDefaultScopeForBrand(selectedBrand)), [field]: value },
        }
      }
      // All other fields sync across every brand
      return Object.fromEntries(
        PAINT_BRANDS.map(b => [
          b.key,
          { ...(prev[b.key] ?? getDefaultScopeForBrand(b.key)), [field]: value },
        ])
      )
    })
  }

  const currentScope = scopeByBrand[selectedBrand] ?? getDefaultScopeForBrand(selectedBrand)

  const [jobType, setJobType] = useState<JobType>(() => initialData?.jobType ?? 'exterior')

  const [includeTax, setIncludeTax] = useState(initialData?.taxExcluded !== true)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [photoUrls,  setPhotoUrls]  = useState<string[]>(initialData?.photoUrls  ?? [])
  const [photoNotes, setPhotoNotes] = useState<string[]>(initialData?.photoNotes ?? [])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function setPhotoNote(index: number, note: string) {
    setPhotoNotes(prev => {
      const next = [...prev]
      // Pad array to match photoUrls length
      while (next.length < photoUrls.length) next.push('')
      next[index] = note
      return next
    })
  }

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

  // Structure add-ons (deck / pergola / fence / shed). Mirrors the proposal
  // page so the form summary subtotal matches the generated estimate.
  const structuresSubtotal = useMemo(() => {
    const deckTotal = deckAddons.reduce(
      (s, addon) => s + calcStructureAddonSubtotal(addon, 1 / 20, appMap, rules, constants, paintProducts), 0)
    const pergola = calcStructureAddonSubtotal(pergolaAddon, 0, appMap, rules, constants, paintProducts)
    const fence   = calcStructureAddonSubtotal(fenceAddon,   0, appMap, rules, constants, paintProducts)
    const shed    = calcStructureAddonSubtotal(shedAddon,    0, appMap, rules, constants, paintProducts)
    return deckTotal + pergola + fence + shed
  }, [deckAddons, pergolaAddon, fenceAddon, shedAddon, appMap, rules, constants, paintProducts])

  // Structures only count toward the total when the job includes them.
  const structTotal = jobType !== 'exterior' ? structuresSubtotal : 0

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

  const PHOTO_LIMIT = 30

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return
    const remaining = PHOTO_LIMIT - photoUrls.length
    const files = Array.from(e.target.files).slice(0, remaining)
    if (!files.length) return
    setUploadingPhotos(true)
    setUploadError(null)
    try {
      const urls = await Promise.all(files.map(f => uploadPhoto(user.uid, f)))
      setPhotoUrls(prev => [...prev, ...urls].slice(0, PHOTO_LIMIT))
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
    const idx = photoUrls.indexOf(url)
    setPhotoUrls(prev => prev.filter(u => u !== url))
    setPhotoNotes(prev => prev.filter((_, i) => i !== idx))
    try { await deletePhoto(url) } catch { /* non-blocking */ }
  }

  async function handleReplacePhoto(oldUrl: string, e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.[0]) return
    setUploadingPhotos(true)
    setUploadError(null)
    try {
      const newUrl = await uploadPhoto(user.uid, e.target.files[0])
      setPhotoUrls(prev => prev.map(u => u === oldUrl ? newUrl : u))
      // note stays at same index — no change needed
      try { await deletePhoto(oldUrl) } catch { /* non-blocking */ }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(msg)
    } finally {
      setUploadingPhotos(false)
      e.target.value = ''
    }
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

  // Zip code required for tax lookup — warn if address present but no zip
  const addressHasZip = /\d{5}/.test(clientAddress)
  const missingZip = clientAddress.trim().length > 0 && !addressHasZip

  // Structures that are enabled but missing a paint product selection
  const structuresMissingPaint: string[] = [
    ...(deckAddons.some(a => a.enabled && !a.paintProductId) ? ['Deck'] : []),
    ...(pergolaAddon.enabled && !pergolaAddon.paintProductId ? ['Pergola'] : []),
    ...(fenceAddon.enabled   && !fenceAddon.paintProductId   ? ['Fence']   : []),
    ...(shedAddon.enabled    && !shedAddon.paintProductId    ? ['Shed']    : []),
  ]
  const hasStructureValidationError = structuresMissingPaint.length > 0

  // Shared payload for both the manual Save buttons and auto-save, so the two
  // paths can never drift. `finalStatus` is the status to persist (callers
  // decide whether to preserve 'approved', keep the current status, etc.).
  function buildEstimatePayload(finalStatus: import('@/types/estimate').EstimateStatus) {
    return {
      userId: user?.uid ?? '',
      status: finalStatus,
      clientName, clientAddress, clientPhone, clientEmail,
      clientFolderId, clientContactId,
      rows,
      woodReplacementRows: woodRows,
      woodReplacementOpen: woodOpen,
      customItems,
      customItemsOpen: customOpen,
      deckAddons,
      pergolaAddon,
      fenceAddon,
      shedAddon,
      selectedBrand,
      selectedBodyPaint:   bodyPaintId,
      selectedTrimPaint:   trimPaintId,
      selectedAccentPaint: accentPaintId,
      selectedStainPaint:  stainPaintId,
      manualPaintAProductId, manualPaintAGallons,
      manualPaintBProductId, manualPaintBGallons,
      scopeProject:       currentScope.scopeProject,
      scopePrepWork:      currentScope.scopePrepWork,
      scopePainting:      currentScope.scopePainting,
      scopeCleanUp:       currentScope.scopeCleanUp,
      scopeWalkThrough:   currentScope.scopeWalkThrough,
      scopePaintProducts: currentScope.scopePaintProducts,
      scopePaintProductsByBrand: Object.fromEntries(
        Object.entries(scopeByBrand).map(([k, v]) => [k, v.scopePaintProducts])
      ),
      scopeByBrand,
      totalColors:  currentScope.totalColors,
      totalCoats:   currentScope.totalCoats,
      photoUrls,
      photoNotes,
      jobType,
      taxExcluded:  !includeTax,
      salesTaxRate: includeTax ? (initialData?.salesTaxRate ?? null) : null,
    }
  }

  async function handleSave(status: 'draft' | 'sent') {
    if (!user) return
    setSaving(true)
    setSaveError(false)
    // Preserve 'approved' status — never downgrade a signed estimate back to draft
    const payload = buildEstimatePayload(initialData?.status === 'approved' ? 'approved' : status)
    try {
      if (isEdit && estimateId) {
        await updateEstimate(estimateId, payload)
        router.push(`/estimates/${estimateId}`)
      } else {
        const id = await createEstimate(payload)
        router.push(`/estimates/${id}/edit`)
      }
    } catch (err) {
      console.error('Save failed:', err)
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  async function saveQuiet(salesTaxRate?: number | null): Promise<void> {
    if (!user) return
    const payload = {
      userId: user.uid,
      status: (initialData?.status ?? 'draft') as import('@/types/estimate').EstimateStatus,
      clientName, clientAddress, clientPhone, clientEmail,
      clientFolderId, clientContactId,
      rows,
      woodReplacementRows: woodRows,
      woodReplacementOpen: woodOpen,
      customItems,
      customItemsOpen: customOpen,
      deckAddons,
      pergolaAddon,
      fenceAddon,
      shedAddon,
      selectedBrand,
      selectedBodyPaint:   bodyPaintId,
      selectedTrimPaint:   trimPaintId,
      selectedAccentPaint: accentPaintId,
      selectedStainPaint:  stainPaintId,
      manualPaintAProductId, manualPaintAGallons,
      manualPaintBProductId, manualPaintBGallons,
      scopeProject:       currentScope.scopeProject,
      scopePrepWork:      currentScope.scopePrepWork,
      scopePainting:      currentScope.scopePainting,
      scopeCleanUp:       currentScope.scopeCleanUp,
      scopeWalkThrough:   currentScope.scopeWalkThrough,
      scopePaintProducts: currentScope.scopePaintProducts,
      scopePaintProductsByBrand: Object.fromEntries(
        Object.entries(scopeByBrand).map(([k, v]) => [k, v.scopePaintProducts])
      ),
      scopeByBrand,
      totalColors:  currentScope.totalColors,
      totalCoats:   currentScope.totalCoats,
      photoUrls,
      photoNotes,
      jobType,
      taxExcluded:  !includeTax,
      salesTaxRate: includeTax ? (salesTaxRate ?? null) : null,
      // Freeze the pricing basis at quote time so later settings edits can't
      // change the customer's quoted/signed price. The proposal page + dashboard
      // recompute against this snapshot instead of live settings.
      pricingSnapshot: {
        rules,
        constants,
        rates,
        paintProducts,
        snapshottedAt: new Date().toISOString(),
      },
    }
    if (isEdit && estimateId) {
      await updateEstimate(estimateId, payload)
    }
  }

  // ── Auto-save ────────────────────────────────────────────────────────────────
  // Preserve whatever status the estimate already has — auto-save must never
  // change it (e.g. downgrade a 'sent'/'approved' estimate to 'draft').
  const autoSavePayload = buildEstimatePayload(initialData?.status ?? 'draft')
  const creatingRef = useRef(false)
  const autoSaveStatus = useAutoSave({
    signature: user ? JSON.stringify(autoSavePayload) : '',
    enabled:   !!user && clientName.trim() !== '' && !saving && !loadingSettings,
    onSave: async () => {
      if (!user) return
      if (isEdit && estimateId) {
        // Auto-save updates content only — never touch the lifecycle status,
        // so a silent save can't downgrade a sent/approved estimate to draft.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { status: _status, ...content } = autoSavePayload
        await updateEstimate(estimateId, content)
      } else if (!creatingRef.current) {
        creatingRef.current = true
        const id = await createEstimate(autoSavePayload)
        router.replace(`/estimates/${id}/edit`)
      }
    },
  })

  if (loadingSettings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <a href="/estimates" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="hidden sm:inline">Estimates</span>
        </a>
        <div className="flex items-center gap-3">
          <a href="/estimates" className="hidden" />
          <AutoSaveIndicator status={autoSaveStatus} />
          {saveError && <span className="text-sm text-red-600">Error saving. Try again.</span>}
          {isEdit && estimateId && (
            <>
              {initialData?.status === 'approved' && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Signed
                </span>
              )}
              {hasStructureValidationError && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Select paint for: {structuresMissingPaint.join(', ')}
                </span>
              )}
              <button
                onClick={async () => {
                  const win = window.open('', '_blank')
                  setSaving(true)
                  try {
                    const taxRate = (includeTax && clientAddress) ? await lookupSalesTax(clientAddress) : null
                    await saveQuiet(taxRate)
                    if (initialData?.status === 'draft' || !initialData?.status) {
                      await updateEstimate(estimateId, { status: 'pending' })
                    } else if (initialData?.status === 'approved') {
                      await resetSignatureForChangeOrder(estimateId)
                    }
                    if (win) win.location.href = `/p/${estimateId}`
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving || hasStructureValidationError || missingZip}
                title={missingZip ? 'Add zip code to address first' : hasStructureValidationError ? `Select paint product for: ${structuresMissingPaint.join(', ')}` : undefined}
                className="hidden sm:inline-flex px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : initialData?.status === 'approved' ? 'Generate New Estimate ↗' : 'Generate Estimate ↗'}
              </button>
            </>
          )}
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? `Edit — ${initialData?.clientName || 'Estimate'}` : 'New Estimate'}
        </h1>

        {/* ── Job Type ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Job Type</p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'exterior',   label: 'Exterior Only' },
              { value: 'structures', label: 'Structures Only' },
              { value: 'both',       label: 'Exterior + Structures' },
            ] as { value: JobType; label: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setJobType(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  jobType === opt.value
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Client Info ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Client Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name">
              <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="John Smith" className="input" />
            </Field>
            <Field label="Address">
              <input
                ref={addressInputRef}
                type="text"
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
                placeholder="123 Main St, City, WA 98000"
                className={`input ${missingZip ? 'border-amber-400 focus:ring-amber-400' : ''}`}
                autoComplete="off"
              />
              {missingZip && (
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Zip code required for sales tax — e.g. &ldquo;Buckley, WA 98321&rdquo;
                </p>
              )}
            </Field>
            <Field label="Phone">
              <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="253-555-0100" className="input" />
            </Field>
            <Field label="Email">
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" className="input" />
            </Field>
            {clientFolderId && (
              <Field label="Folder ID">
                <input type="text" value={clientFolderId} readOnly className="input bg-gray-50 text-gray-500 cursor-not-allowed" />
              </Field>
            )}
            <Field label="GHL Contact ID">
              <input
                type="text"
                value={clientContactId}
                onChange={e => setClientContactId(e.target.value)}
                placeholder="Paste GHL contact ID (optional)"
                className="input"
              />
            </Field>
          </div>
        </section>

        {/* ── Measurements ──────────────────────────────────────────────── */}
        {jobType !== 'structures' && <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Measurements</h2>
            <button onClick={addRow} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Row
            </button>
          </div>
          <div className="hidden sm:block overflow-x-auto">
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
                          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                            className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
          <div className="sm:hidden space-y-3">
            {rows.map(row => {
              const app = appMap.get(row.applicationKey)
              const total = row.front + row.right + row.back + row.left
              const hours = app ? total * app.converter : 0
              return (
                <div key={row.id} className="border border-gray-200 rounded-xl p-3 space-y-2.5 bg-gray-50">
                  <select
                    value={row.applicationKey}
                    onChange={e => updateRow(row.id, 'applicationKey', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">— Select Application —</option>
                    {groupedApps.map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map(opt => (
                          <option key={opt.uniqueKey} value={opt.uniqueKey}>{opt.label} ({opt.unitLabel})</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    {(['front', 'right', 'back', 'left'] as const).map(side => (
                      <div key={side}>
                        <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{side}</label>
                        <input
                          type="number" min={0}
                          value={row[side] || ''}
                          onChange={e => updateRow(row.id, side, parseFloat(e.target.value) || 0)}
                          className="w-full text-right rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                    <span>Total: <span className="font-medium text-gray-700">{total > 0 ? total.toLocaleString() : '—'}</span></span>
                    <span>Hours: <span className="font-medium text-gray-700">{hours > 0 ? fmtHrs(hours) : '—'}</span></span>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>}

        {/* ── Add Ons ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Add Ons</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            {jobType !== 'structures' && (
              <button
                onClick={() => setWoodOpen(o => !o)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  woodOpen
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                Wood Replacement
              </button>
            )}
            <button
              onClick={() => setCustomOpen(o => !o)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                customOpen
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
              }`}
            >
              Custom Item
            </button>
            {/* Structure toggles — shown for structures or both */}
            {jobType !== 'exterior' && (
              <>
                <button
                  onClick={() => setDeckAddons(ads => ads.map(a => ({ ...a, enabled: !ads[0].enabled })))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    deckAddons[0]?.enabled
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                  }`}
                >
                  Deck
                </button>
                {(['Pergola', 'Fence', 'Shed'] as const).map(name => {
                  const key = name.toLowerCase() as 'pergola' | 'fence' | 'shed'
                  const addonMap = { pergola: pergolaAddon, fence: fenceAddon, shed: shedAddon }
                  const setterMap = { pergola: setPergolaAddon, fence: setFenceAddon, shed: setShedAddon }
                  const addon = addonMap[key]
                  const setter = setterMap[key]
                  return (
                    <button
                      key={name}
                      onClick={() => setter(a => ({ ...a, enabled: !a.enabled }))}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        addon.enabled
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                      }`}
                    >
                      {name}
                    </button>
                  )
                })}
              </>
            )}
          </div>

          {woodOpen && (
            <div className="mt-4">
              <div className="hidden sm:block overflow-x-auto">
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
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                                className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              <div className="sm:hidden space-y-3">
                {woodRows.map(row => {
                  const rate = row.itemKey ? ((rates.woodReplacement as Record<string, number>)[row.itemKey] ?? 0) : 0
                  const total = row.front + row.right + row.back + row.left
                  const price = markup > 0 ? total * rate / markup : 0
                  return (
                    <div key={row.id} className="border border-gray-200 rounded-xl p-3 space-y-2.5 bg-gray-50">
                      <select
                        value={row.itemKey}
                        onChange={e => updateWoodRow(row.id, 'itemKey', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">— Wood Replacement —</option>
                        {WOOD_ITEMS.map(item => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        {(['front', 'right', 'back', 'left'] as const).map(side => (
                          <div key={side}>
                            <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{side}</label>
                            <input
                              type="number" min={0}
                              value={row[side] || ''}
                              onChange={e => updateWoodRow(row.id, side, parseFloat(e.target.value) || 0)}
                              className="w-full text-right rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                        <span>Total: <span className="font-medium text-gray-700">{total > 0 ? total : '—'}</span></span>
                        <span>Price: <span className="font-medium text-gray-700">{fmtCents(price)}</span></span>
                        <button onClick={() => removeWoodRow(row.id)} className="text-red-400 hover:text-red-600 p-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between items-center px-1 font-medium text-sm text-gray-700 pt-1">
                  <span>Total Price</span>
                  <span className="font-bold tabular-nums">{fmtCents(woodTotal)}</span>
                </div>
              </div>
              <button
                onClick={addWoodRow}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Row
              </button>
            </div>
          )}

          {deckAddons[0]?.enabled && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              {deckAddons.map((addon, idx) => (
                <div key={idx} className={idx > 0 ? 'mt-6 border-t border-gray-100 pt-4' : ''}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">
                      {deckAddons.length > 1 ? `Deck ${idx + 1}` : 'Deck'}
                    </h3>
                    {deckAddons.length > 1 && (
                      <button
                        onClick={() => setDeckAddons(ads => ads.filter((_, i) => i !== idx))}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <StructureTable
                    addon={addon}
                    onChange={a => setDeckAddons(ads => ads.map((x, i) => i === idx ? a : x))}
                    appMap={appMap}
                    groupedApps={groupedApps}
                    paintProducts={paintProducts}
                    setupFraction={1 / 20}
                    rules={rules}
                    constants={constants}
                  />
                </div>
              ))}
              <button
                onClick={() => setDeckAddons(ads => [...ads, makeStructureAddon(DECK_DEFAULTS)])}
                className="mt-4 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Another Deck
              </button>
            </div>
          )}

          {pergolaAddon.enabled && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Pergola</h3>
              <StructureTable
                addon={pergolaAddon}
                onChange={setPergolaAddon}
                appMap={appMap}
                groupedApps={groupedApps}
                paintProducts={paintProducts}
                rules={rules}
                constants={constants}
              />
            </div>
          )}

          {fenceAddon.enabled && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Fence</h3>
              <StructureTable
                addon={fenceAddon}
                onChange={setFenceAddon}
                appMap={appMap}
                groupedApps={groupedApps}
                paintProducts={paintProducts}
                rules={rules}
                constants={constants}
              />
            </div>
          )}

          {shedAddon.enabled && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Shed</h3>
              <StructureTable
                addon={shedAddon}
                onChange={setShedAddon}
                appMap={appMap}
                groupedApps={groupedApps}
                paintProducts={paintProducts}
                rules={rules}
                constants={constants}
              />
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
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            type="number" min={0}
                            value={item.price || ''}
                            onChange={e => updateCustomItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full text-right rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800"
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
        <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">Photos</h2>
              <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {photoUrls.length} / {PHOTO_LIMIT}
              </span>
            </div>
            {photoUrls.length < PHOTO_LIMIT && (
              <label className={`flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none ${
                uploadingPhotos ? 'text-gray-400 pointer-events-none' : 'text-brand-600 hover:text-brand-800'
              }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {uploadingPhotos ? 'Uploading…' : 'Add Photos'}
                <input type="file" accept="image/*" multiple className="sr-only" disabled={uploadingPhotos} onChange={handlePhotoUpload} />
              </label>
            )}
          </div>

          {uploadError && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Upload failed: {uploadError}
            </div>
          )}

          {uploadingPhotos && (
            <div className="mb-3 flex items-center gap-2 text-sm text-brand-600">
              <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              Uploading…
            </div>
          )}

          {photoUrls.length === 0 ? (
            <label className={`flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-10 cursor-pointer transition-colors ${
              uploadingPhotos ? 'opacity-50 pointer-events-none' : 'hover:border-brand-300 hover:bg-brand-50'
            }`}>
              <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              <p className="text-sm text-gray-400">Click to upload photos</p>
              <p className="text-xs text-gray-300 mt-1">Up to {PHOTO_LIMIT} images</p>
              <input type="file" accept="image/*" multiple className="sr-only" disabled={uploadingPhotos} onChange={handlePhotoUpload} />
            </label>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photoUrls.map((url, idx) => (
                <div key={url} className="flex flex-col rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                  {/* Image */}
                  <div className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />

                    {/* Action bar */}
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1 bg-black/50">
                      <label className="flex items-center gap-1 text-white text-xs font-medium cursor-pointer hover:text-brand-300 transition-colors" title="Replace photo">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                        Edit
                        <input type="file" accept="image/*" className="sr-only" disabled={uploadingPhotos} onChange={e => handleReplacePhoto(url, e)} />
                      </label>
                      <button onClick={() => handleRemovePhoto(url)} className="flex items-center gap-1 text-white text-xs font-medium hover:text-red-400 transition-colors" disabled={uploadingPhotos}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                        Remove
                      </button>
                    </div>

                    {/* Number badge */}
                    <div className="absolute top-1.5 left-1.5 bg-black/50 text-white text-xs font-semibold rounded px-1.5 py-0.5">{idx + 1}</div>
                  </div>

                  {/* Note input */}
                  <input
                    type="text"
                    value={photoNotes[idx] ?? ''}
                    onChange={e => setPhotoNote(idx, e.target.value)}
                    placeholder="Add a note…"
                    className="w-full px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 bg-white border-t border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
              ))}

              {/* Add more tile */}
              {photoUrls.length < PHOTO_LIMIT && (
                <label className={`aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  uploadingPhotos ? 'opacity-50 pointer-events-none' : 'hover:border-brand-300 hover:bg-brand-50'
                }`}>
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-xs text-gray-400 mt-1">Add more</span>
                  <input type="file" accept="image/*" multiple className="sr-only" disabled={uploadingPhotos} onChange={handlePhotoUpload} />
                </label>
              )}
            </div>
          )}
        </section>

        {/* ── Paint Selection ───────────────────────────────────────────── */}
        {jobType !== 'structures' && <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Paint Selection</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {PAINT_BRANDS.map(brand => (
              <button
                key={brand.key}
                onClick={() => selectBrand(brand.key)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  selectedBrand === brand.key
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {brand.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
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
          </div>
        </section>}

        {/* ── Summary ───────────────────────────────────────────────────── */}
        {jobType !== 'structures' && <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Estimate Summary</h2>
          {totals ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
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
                  {(woodTotal > 0 || customTotal > 0 || structTotal > 0) && <SummaryRow label="Painting Subtotal" value={fmtCents(totals.subtotal)} />}
                  {structTotal > 0 && <SummaryRow label="Structures"       value={fmtCents(structTotal)} />}
                  {woodTotal   > 0 && <SummaryRow label="Wood Replacement" value={fmtCents(woodTotal)} />}
                  {customTotal > 0 && <SummaryRow label="Custom Items"     value={fmtCents(customTotal)} />}
                  <SummaryRow label="Subtotal" value={fmtCents(totals.subtotal + structTotal + woodTotal + customTotal)} bold />
                  <SummaryRow label="10% Off"  value={fmtCents((totals.subtotal + structTotal + woodTotal + customTotal) * 0.90)} />
                  <div className="flex items-center justify-between pt-1">
                    <label htmlFor="includeTax" className="text-sm text-gray-600 cursor-pointer select-none">
                      Include Sales Tax
                    </label>
                    <button
                      id="includeTax"
                      role="switch"
                      aria-checked={includeTax}
                      onClick={() => setIncludeTax(v => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
                        includeTax ? 'bg-brand-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        includeTax ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  {!includeTax && (
                    <p className="text-xs text-amber-600">Tax will not be added to this estimate.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Add measurement rows above to see the estimate.</p>
          )}
        </section>}

        {/* ── Scope of Work ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Scope of Work</h2>
            <span className="text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-full px-3 py-1">
              {PAINT_BRANDS.find(b => b.key === selectedBrand)?.label ?? selectedBrand}
            </span>
          </div>
          <div className="space-y-4">
            <Field label="Project Description">
              <textarea rows={2} value={currentScope.scopeProject} onChange={e => updateScope('scopeProject', e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Prep Work">
              <textarea rows={5} value={currentScope.scopePrepWork} onChange={e => updateScope('scopePrepWork', e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Painting">
              <textarea rows={5} value={currentScope.scopePainting} onChange={e => updateScope('scopePainting', e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Clean Up">
              <textarea rows={3} value={currentScope.scopeCleanUp} onChange={e => updateScope('scopeCleanUp', e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Walk Through">
              <textarea rows={2} value={currentScope.scopeWalkThrough} onChange={e => updateScope('scopeWalkThrough', e.target.value)} className="input resize-none" />
            </Field>
            <Field label="Paint Products">
              <textarea rows={2} value={currentScope.scopePaintProducts} onChange={e => updateScope('scopePaintProducts', e.target.value)} className="input resize-none" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Total Colors">
                <input type="text" value={currentScope.totalColors} onChange={e => updateScope('totalColors', e.target.value)} className="input" />
              </Field>
              <Field label="Total Coats">
                <input type="text" value={currentScope.totalCoats} onChange={e => updateScope('totalCoats', e.target.value)} className="input" />
              </Field>
            </div>
          </div>
        </section>

        {/* ── Bottom save ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pb-10">
          {isEdit && estimateId && (
            <>
              {missingZip && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Add zip code to address (required for tax)
                </span>
              )}
              {hasStructureValidationError && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Select paint for: {structuresMissingPaint.join(', ')}
                </span>
              )}
              <button
                onClick={async () => {
                  const win = window.open('', '_blank')
                  setSaving(true)
                  try {
                    const taxRate = clientAddress ? await lookupSalesTax(clientAddress) : null
                    await saveQuiet(taxRate)
                    if (initialData?.status === 'approved') {
                      await resetSignatureForChangeOrder(estimateId)
                    }
                    if (win) win.location.href = `/p/${estimateId}`
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving || hasStructureValidationError || missingZip}
                title={missingZip ? 'Add zip code to address first' : hasStructureValidationError ? `Select paint product for: ${structuresMissingPaint.join(', ')}` : undefined}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : initialData?.status === 'approved' ? 'Generate New Estimate ↗' : 'Generate Estimate ↗'}
              </button>
            </>
          )}
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
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
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
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
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
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
          className="w-full text-right text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="0"
        />
      </td>
      <td className="px-4 py-1.5 text-right tabular-nums text-gray-700">{fmtCents(cost)}</td>
    </tr>
  )
}
