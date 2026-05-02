'use client'

import { useState, useEffect, useMemo, use, useRef, useCallback } from 'react'
import { getEstimate, acceptEstimate } from '@/lib/firebase/estimates'
import { getSettingsDoc } from '@/lib/firebase/settings'
import { buildApplicationList } from '@/lib/applicationList'
import { calcEstimate, calcMarkup } from '@/lib/estimateEngine'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
  DEFAULT_COMPANY,
} from '@/lib/defaultSettings'
import type { EstimateData } from '@/types/estimate'
import type {
  BusinessRules, ProductionConstants, PaintProduct, ProductionRates, CompanySettings,
} from '@/types/settings'

// ─── Paint brand presets (mirrors EstimateForm) ──────────────────────────────

const PAINT_BRANDS = [
  { key: 'superPaint', label: 'Super Paint',          bodyId: 'sw-super-paint-flat', trimId: 'sw-super-paint-satin', accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'duration',   label: 'Duration',             bodyId: 'sw-duration-flat',    trimId: 'sw-duration-satin',   accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'emerald',    label: 'Emerald',              bodyId: 'sw-emerald-flat',     trimId: 'sw-emerald-satin',    accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'emeraldRR',  label: 'Emerald Rain Refresh', bodyId: 'sw-emerald-rr-flat',  trimId: 'sw-emerald-rr-satin', accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
]

const emptyPaint: PaintProduct = { id: '', name: '', singleGallon: 0, fiveGallon: 0, coverage: 400 }

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [estimate, setEstimate]       = useState<EstimateData | null>(null)
  const [rules, setRules]             = useState<BusinessRules>(DEFAULT_BUSINESS_RULES)
  const [constants, setConstants]     = useState<ProductionConstants>(DEFAULT_PRODUCTION_CONSTANTS)
  const [paintProducts, setPaintProducts] = useState<PaintProduct[]>(DEFAULT_PAINT_PRODUCTS)
  const [rates, setRates]             = useState<ProductionRates>(DEFAULT_RATES)
  const [company, setCompany]         = useState<CompanySettings>(DEFAULT_COMPANY)
  const [loading, setLoading]         = useState(true)

  // Customer-interactive state
  const [selectedBrand, setSelectedBrand] = useState('superPaint')
  const [includeWood,   setIncludeWood]   = useState(false)
  const [includeCustom, setIncludeCustom] = useState(false)

  // Signature state
  const [sigName,     setSigName]     = useState('')
  const [sigDataUrl,  setSigDataUrl]  = useState<string | null>(null)
  const [agreed,      setAgreed]      = useState(false)
  const [signing,     setSigning]     = useState(false)
  const [signed,      setSigned]      = useState(false)

  useEffect(() => {
    async function load() {
      const [est, r, c, pp, rt, co] = await Promise.all([
        getEstimate(id),
        getSettingsDoc<BusinessRules>('businessRules', DEFAULT_BUSINESS_RULES),
        getSettingsDoc<ProductionConstants>('productionConstants', DEFAULT_PRODUCTION_CONSTANTS),
        getSettingsDoc<{ items: PaintProduct[] }>('paintProducts', { items: DEFAULT_PAINT_PRODUCTS }),
        getSettingsDoc<ProductionRates>('rates', DEFAULT_RATES),
        getSettingsDoc<CompanySettings>('company', DEFAULT_COMPANY),
      ])
      if (est) {
        setEstimate(est)
        setSelectedBrand(est.selectedBrand ?? 'superPaint')
        setIncludeWood(est.woodReplacementOpen ?? false)
        setIncludeCustom(est.customItemsOpen ?? false)
        setSigned(est.status === 'approved')
        setSigName(est.signatureName ?? '')
      }
      setRules(r)
      setConstants(c)
      setPaintProducts(pp.items ?? DEFAULT_PAINT_PRODUCTS)
      setRates(rt)
      setCompany(co)
      setLoading(false)
    }
    load()
  }, [id])

  const applications = useMemo(() => buildApplicationList(rates), [rates])
  const appMap       = useMemo(() => new Map(applications.map(a => [a.uniqueKey, a])), [applications])
  const markup       = useMemo(() => calcMarkup(rules), [rules])

  // Paint totals for the currently selected brand
  const totals = useMemo(() => {
    if (!estimate?.rows?.length) return null
    const brand = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
    const bodyPaint   = paintProducts.find(p => p.id === brand.bodyId)   ?? emptyPaint
    const trimPaint   = paintProducts.find(p => p.id === brand.trimId)   ?? emptyPaint
    const accentPaint = paintProducts.find(p => p.id === brand.accentId) ?? emptyPaint
    const stainPaint  = paintProducts.find(p => p.id === brand.stainId)  ?? emptyPaint
    const validRows   = estimate.rows.filter(r => r.applicationKey !== '')
    if (!validRows.length) return null
    return calcEstimate(validRows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint)
  }, [estimate, selectedBrand, paintProducts, appMap, rules, constants])

  // Wood replacement — always compute raw so the checkbox can show the price
  const woodTotalRaw = useMemo(() => {
    if (markup <= 0 || !estimate?.woodReplacementRows?.length) return 0
    return estimate.woodReplacementRows.reduce((sum, row) => {
      if (!row.itemKey) return sum
      const rate = (rates.woodReplacement as Record<string, number>)[row.itemKey] ?? 0
      const total = row.front + row.right + row.back + row.left
      return sum + (total * rate / markup)
    }, 0)
  }, [estimate, rates, markup])

  // Custom items — always compute raw
  const customTotalRaw = useMemo(() => {
    if (!estimate?.customItems?.length) return 0
    return estimate.customItems.reduce((sum, item) => {
      if (!item.description && !item.price) return sum
      return sum + (item.price || 0)
    }, 0)
  }, [estimate])

  const woodTotal   = includeWood   ? woodTotalRaw   : 0
  const customTotal = includeCustom ? customTotalRaw : 0

  const paintingSubtotal  = totals?.subtotal ?? 0
  const combinedSubtotal  = paintingSubtotal + woodTotal + customTotal
  const discounted        = combinedSubtotal * 0.90
  const taxRate           = estimate?.salesTaxRate ?? null
  const taxAmount         = taxRate != null ? discounted * taxRate : 0
  const grandTotal        = discounted + taxAmount
  const depositAmount     = grandTotal * (rules.depositPercent ?? 0.20)

  const hasWoodData   = (estimate?.woodReplacementRows ?? []).some(r => r.itemKey && (r.front + r.right + r.back + r.left) > 0)
  const hasCustomData = (estimate?.customItems ?? []).some(i => i.description && (i.price ?? 0) > 0)

  async function handleSign() {
    if (!sigName.trim() || !agreed || !sigDataUrl) return
    setSigning(true)
    try {
      await acceptEstimate(id, sigName.trim(), sigDataUrl)
      setSigned(true)
      setEstimate(prev => prev ? { ...prev, status: 'approved', signatureName: sigName.trim() } : prev)
    } catch (err) {
      console.error('Failed to accept estimate:', err)
    } finally {
      setSigning(false)
    }
  }

  // ── Loading / not found ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Estimate not found.</p>
      </div>
    )
  }

  const hasScope = estimate.scopePrepWork || estimate.scopePainting || estimate.scopeProject ||
                   estimate.scopeCleanUp  || estimate.scopeWalkThrough || estimate.scopePaintProducts

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Company header ─────────────────────────────────────────────── */}
        <div className="bg-brand-700 text-white rounded-2xl p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {company.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                  className="h-16 max-w-[140px] object-contain rounded-lg bg-white p-2 shrink-0 shadow-sm"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
                <p className="text-brand-200 text-sm mt-1">{company.streetAddress} · {company.cityStateZip}</p>
                <p className="text-brand-200 text-sm">{company.phone} · {company.email}</p>
                {company.website && <p className="text-brand-200 text-sm">{company.website}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-brand-300 text-xs uppercase tracking-wide">Date</p>
              <p className="text-sm font-semibold mt-0.5">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* ── Prepared for ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Estimate Prepared For</p>
          <h2 className="text-xl font-bold text-gray-900">{estimate.clientName || 'Valued Customer'}</h2>
          {estimate.clientAddress && <p className="text-gray-500 mt-1 text-sm">{estimate.clientAddress}</p>}
          <div className="flex gap-5 mt-2 text-sm text-gray-400">
            {estimate.clientPhone && <span>{estimate.clientPhone}</span>}
            {estimate.clientEmail && <span>{estimate.clientEmail}</span>}
          </div>
        </div>

        {/* ── Scope of work ──────────────────────────────────────────────── */}
        {hasScope && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Scope of Work</h3>
            <div className="space-y-4">
              {estimate.scopeProject      && <ScopeBlock label="Project"        text={estimate.scopeProject} />}
              {estimate.scopePrepWork     && <ScopeBlock label="Prep Work"      text={estimate.scopePrepWork} />}
              {estimate.scopePainting     && <ScopeBlock label="Painting"       text={estimate.scopePainting} />}
              {estimate.scopeCleanUp      && <ScopeBlock label="Clean Up"       text={estimate.scopeCleanUp} />}
              {estimate.scopeWalkThrough  && <ScopeBlock label="Walk Through"   text={estimate.scopeWalkThrough} />}
              {estimate.scopePaintProducts && <ScopeBlock label="Paint Products" text={estimate.scopePaintProducts} />}
              {(estimate.totalColors || estimate.totalCoats) && (
                <div className="flex gap-6 pt-3 border-t border-gray-100">
                  {estimate.totalColors && (
                    <div>
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Colors: </span>
                      <span className="text-sm font-medium text-gray-700">{estimate.totalColors}</span>
                    </div>
                  )}
                  {estimate.totalCoats && (
                    <div>
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Coats: </span>
                      <span className="text-sm font-medium text-gray-700">{estimate.totalCoats}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Photos ─────────────────────────────────────────────────────── */}
        {(estimate.photoUrls?.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Project Photos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {estimate.photoUrls!.map((url, idx) => (
                <div key={url} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Paint options + add-ons ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-1">Choose Your Paint</h3>
          <p className="text-sm text-gray-400 mb-4">Select a paint tier to see how it affects your price.</p>
          <div className="flex flex-wrap gap-2">
            {PAINT_BRANDS.map(brand => (
              <button
                key={brand.key}
                onClick={() => setSelectedBrand(brand.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  selectedBrand === brand.key
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {brand.label}
              </button>
            ))}
          </div>

          {/* Add-on toggles */}
          {(hasWoodData || hasCustomData) && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-700 mb-3">Optional Add-Ons</p>
              <div className="space-y-3">
                {hasWoodData && (
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={includeWood}
                        onChange={e => setIncludeWood(e.target.checked)}
                        className="w-4 h-4 rounded accent-brand-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Wood Replacement</p>
                        <p className="text-xs text-gray-400">Replace damaged or rotted wood before painting</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ml-4 ${woodTotalRaw > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                      {woodTotalRaw > 0 ? `+ ${fmtD(woodTotalRaw)}` : '—'}
                    </span>
                  </label>
                )}
                {hasCustomData && (estimate.customItems ?? []).filter(i => i.description && i.price > 0).map(item => (
                  <label key={item.id} className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={includeCustom}
                        onChange={e => setIncludeCustom(e.target.checked)}
                        className="w-4 h-4 rounded accent-brand-600"
                      />
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{item.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums ml-4">+ {fmtD(item.price)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Pricing summary ────────────────────────────────────────────── */}
        {totals && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white text-center text-xs font-bold py-2.5 tracking-widest uppercase">
              Your Estimate
            </div>
            <div className="p-6 space-y-2.5">
              <PriceLine label={`Exterior Painting — ${PAINT_BRANDS.find(b => b.key === selectedBrand)?.label}`} value={fmtD(paintingSubtotal)} />
              {includeWood && woodTotal > 0 && <PriceLine label="Wood Replacement" value={fmtD(woodTotal)} />}
              {includeCustom && (estimate.customItems ?? []).filter(i => i.description && i.price > 0).map(item => (
                <PriceLine key={item.id} label={item.description} value={fmtD(item.price)} />
              ))}

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <PriceLine label="Subtotal" value={fmtD(combinedSubtotal)} />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-green-700">10% Loyalty Discount</span>
                  <span className="text-sm font-medium text-green-700">− {fmtD(combinedSubtotal * 0.10)}</span>
                </div>
                {taxRate != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Sales Tax ({(taxRate * 100).toFixed(1)}%)
                    </span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">+ {fmtD(taxAmount)}</span>
                  </div>
                )}
              </div>

              <div className="border-t-2 border-gray-800 pt-4 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Your Total</span>
                <span className="text-3xl font-bold text-brand-700">{fmt(grandTotal)}</span>
              </div>

              <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 flex justify-between items-center mt-1">
                <div>
                  <p className="text-sm font-semibold text-brand-800">Required Deposit</p>
                  <p className="text-xs text-brand-500">{Math.round((rules.depositPercent ?? 0.20) * 100)}% due at project start</p>
                </div>
                <span className="text-lg font-bold text-brand-800">{fmt(depositAmount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Accept / Signature ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {signed ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900">Estimate Accepted!</h3>
              {estimate.signatureName && (
                <p className="text-gray-500 mt-2">Signed by <strong>{estimate.signatureName}</strong></p>
              )}
              {estimate.signatureDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={estimate.signatureDataUrl}
                  alt="Signature"
                  className="mx-auto mt-3 max-h-16 border border-gray-200 rounded-lg bg-gray-50 px-4 py-2"
                />
              )}
              <p className="text-sm text-gray-400 mt-3">
                Thank you! We will reach out shortly to schedule your project.
              </p>
            </div>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-900 mb-1">Accept This Estimate</h3>
              <p className="text-sm text-gray-400 mb-5">
                By signing below you authorize {company.name} to proceed with the work described
                above at the price shown.
              </p>
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="text-sm text-gray-600">
                    I have read and agree to the scope of work and pricing outlined above.
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={sigName}
                    onChange={e => setSigName(e.target.value)}
                    placeholder="Type your full name"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Signature <span className="text-red-400">*</span>
                    </label>
                    {sigDataUrl && (
                      <button
                        onClick={() => setSigDataUrl(null)}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <SignaturePad onSign={setSigDataUrl} cleared={!sigDataUrl} />
                  {!sigDataUrl && (
                    <p className="mt-1.5 text-xs text-gray-400">Draw your signature above using your finger or mouse.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date</label>
                  <input
                    readOnly
                    value={new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-default"
                  />
                </div>

                <button
                  onClick={handleSign}
                  disabled={!agreed || !sigName.trim() || !sigDataUrl || signing}
                  className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {signing ? 'Signing…' : 'Sign & Accept Estimate'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-6">
          {company.name} · {company.phone} · {company.email}
        </p>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScopeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  )
}

function PriceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900 tabular-nums shrink-0">{value}</span>
    </div>
  )
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

function SignaturePad({
  onSign,
  cleared,
}: {
  onSign: (dataUrl: string) => void
  cleared: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const lastPos   = useRef<{ x: number; y: number } | null>(null)

  // Clear the canvas whenever the parent resets `cleared`
  useEffect(() => {
    if (!cleared) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [cleared])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }, [])

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    drawing.current = true
    lastPos.current = getPos(e, canvas)
  }, [getPos])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e, canvas)
    if (lastPos.current) {
      ctx.beginPath()
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth   = 2.5
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }
    lastPos.current = pos
  }, [getPos])

  const endDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing.current) return
    drawing.current = false
    lastPos.current = null
    const canvas = canvasRef.current
    if (!canvas) return
    // Check if anything was drawn (not just blank)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const hasInk = data.some((v, i) => i % 4 === 3 && v > 0)
    if (hasInk) onSign(canvas.toDataURL('image/png'))
  }, [onSign])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={150}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
      className="w-full h-[150px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 touch-none cursor-crosshair"
    />
  )
}
