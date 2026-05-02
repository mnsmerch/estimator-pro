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

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCityFromAddress(address: string): string {
  // "1234 Main St, Kirkland, WA 98033" → "Kirkland"
  const parts = address.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
  if (parts.length < 2) return ''
  const cityChunk = parts[1] ?? ''
  return cityChunk.replace(/\s+[A-Z]{2}\s+[\d-]+$/, '').replace(/\s+[A-Z]{2}$/, '').trim()
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
  const [loadError, setLoadError]     = useState<string | null>(null)

  // Customer-interactive state
  const [selectedBrand,  setSelectedBrand]  = useState('superPaint')
  const [includeWood,    setIncludeWood]    = useState(false)
  const [includeCustom,  setIncludeCustom]  = useState(false)
  const [applyDiscount,  setApplyDiscount]  = useState(true)

  // Logo load state — hide the white box until the image file itself has downloaded
  const [logoLoaded, setLogoLoaded] = useState(false)

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Signature state
  const [sigName,     setSigName]     = useState('')
  const [sigDataUrl,  setSigDataUrl]  = useState<string | null>(null)
  const [agreed,      setAgreed]      = useState(false)
  const [signing,     setSigning]     = useState(false)
  const [signed,      setSigned]      = useState(false)

  useEffect(() => {
    async function load() {
      try {
      const tryRead = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
        try { return await fn() }
        catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          throw new Error(`[${label}] ${msg}`)
        }
      }
      const [est, r, c, pp, rt, co] = await Promise.all([
        tryRead('estimates', () => getEstimate(id)),
        tryRead('settings/businessRules', () => getSettingsDoc<BusinessRules>('businessRules', DEFAULT_BUSINESS_RULES)),
        tryRead('settings/productionConstants', () => getSettingsDoc<ProductionConstants>('productionConstants', DEFAULT_PRODUCTION_CONSTANTS)),
        tryRead('settings/paintProducts', () => getSettingsDoc<{ items: PaintProduct[] }>('paintProducts', { items: DEFAULT_PAINT_PRODUCTS })),
        tryRead('settings/rates', () => getSettingsDoc<ProductionRates>('rates', DEFAULT_RATES)),
        tryRead('settings/company', () => getSettingsDoc<CompanySettings>('company', DEFAULT_COMPANY)),
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setLoadError(msg)
        setLoading(false)
      }
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
  const discountAmount    = applyDiscount ? combinedSubtotal * 0.10 : 0
  const discounted        = combinedSubtotal - discountAmount
  const taxRate           = estimate?.salesTaxRate ?? null
  const taxAmount         = taxRate != null ? discounted * taxRate : 0
  const grandTotal        = discounted + taxAmount
  const depositPercent    = rules.depositPercent ?? 0.20
  const depositAmount     = grandTotal * depositPercent
  const balanceDue        = grandTotal - depositAmount

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

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center">
          <p className="text-red-600 font-semibold mb-2">Failed to load estimate</p>
          <p className="text-sm text-gray-500 font-mono break-all">{loadError}</p>
        </div>
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
                  onLoad={() => setLogoLoaded(true)}
                  className={`h-16 max-w-[140px] object-contain rounded-lg bg-white p-2 shrink-0 shadow-sm transition-opacity duration-300 ${
                    logoLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
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
        <div className="bg-white rounded-2xl border border-gray-200 px-8 py-6 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Prepared For</p>
            <p className="text-base font-semibold text-gray-800">{estimate.clientName || 'Valued Customer'}</p>
            {estimate.clientPhone && <p className="text-sm text-gray-600 mt-1">{estimate.clientPhone}</p>}
            {estimate.clientEmail && <p className="text-sm text-gray-600 mt-1">{estimate.clientEmail}</p>}
          </div>
          {estimate.clientAddress && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Project Location</p>
              <p className="text-base font-semibold text-gray-800">{estimate.clientAddress}</p>
            </div>
          )}
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
                <button
                  key={url}
                  onClick={() => setLightboxIndex(idx)}
                  className="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-zoom-in group focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Lightbox ───────────────────────────────────────────────────── */}
        {lightboxIndex !== null && estimate.photoUrls && (
          <Lightbox
            urls={estimate.photoUrls}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onPrev={() => setLightboxIndex(i => (i! - 1 + estimate.photoUrls!.length) % estimate.photoUrls!.length)}
            onNext={() => setLightboxIndex(i => (i! + 1) % estimate.photoUrls!.length)}
          />
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

        {/* ── Discount toggle ────────────────────────────────────────────── */}
        {totals && (
          <div className={`rounded-2xl border-2 p-5 transition-colors ${
            applyDiscount ? 'bg-green-50 border-green-400' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-base font-bold text-gray-900">Sign Today &amp; Save 10%</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  Accept this estimate today and save{' '}
                  <span className="font-semibold text-green-700">{fmtD(combinedSubtotal * 0.10)}</span>{' '}
                  off your project.
                </p>
                {applyDiscount && (
                  <p className="text-sm font-semibold text-green-700 mt-2">
                    ✓ 10% discount applied — {fmtD(combinedSubtotal * 0.10)} savings included in your total
                  </p>
                )}
              </div>
              {/* Toggle */}
              <button
                role="switch"
                aria-checked={applyDiscount}
                onClick={() => setApplyDiscount(v => !v)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                  applyDiscount ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${
                  applyDiscount ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        )}

        {/* ── Pricing summary ────────────────────────────────────────────── */}
        {totals && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white text-center text-xs font-bold py-2.5 tracking-widest uppercase">
              Your Estimate
            </div>
            <div className="p-6">

              {/* Line items */}
              <div className="space-y-2.5">
                <PriceLine label={`Exterior Painting — ${PAINT_BRANDS.find(b => b.key === selectedBrand)?.label}`} value={fmtD(paintingSubtotal)} />
                {includeWood && woodTotal > 0 && <PriceLine label="Wood Replacement" value={fmtD(woodTotal)} />}
                {includeCustom && (estimate.customItems ?? []).filter(i => i.description && i.price > 0).map(item => (
                  <PriceLine key={item.id} label={item.description} value={fmtD(item.price)} />
                ))}
              </div>

              {/* Subtotal / discount / tax */}
              <div className="border-t border-gray-100 mt-4 pt-4 space-y-2.5">
                <PriceLine label="Subtotal" value={fmtD(combinedSubtotal)} />
                {applyDiscount && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-700">Discount (10% — Sign Today)</span>
                    <span className="text-sm font-medium text-green-700 tabular-nums">− {fmtD(discountAmount)}</span>
                  </div>
                )}
                {taxRate != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Sales Tax ({(taxRate * 100).toFixed(1)}%{parseCityFromAddress(estimate.clientAddress) ? ` — ${parseCityFromAddress(estimate.clientAddress)}` : ''})
                    </span>
                    <span className="text-sm text-gray-900 tabular-nums">+ {fmtD(taxAmount)}</span>
                  </div>
                )}
              </div>

              {/* Deposit */}
              <div className="bg-brand-50 border-t border-brand-200 mt-4 px-4 py-4 -mx-6 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-brand-700">Deposit Due ({Math.round(depositPercent * 100)}%)</p>
                  <p className="text-xs text-brand-500 mt-0.5">Required to secure your project start date</p>
                </div>
                <span className="text-xl font-bold text-brand-600 tabular-nums">{fmtD(depositAmount)}</span>
              </div>

              {/* Balance */}
              <div className="border-t border-gray-100 pt-3 pb-1 flex justify-between items-center">
                <span className="text-sm text-gray-400">Balance due on completion</span>
                <span className="text-sm text-gray-400 tabular-nums">{fmtD(balanceDue)}</span>
              </div>

              {/* Grand total */}
              <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-base font-bold text-gray-900 tabular-nums">{fmtD(grandTotal)}</span>
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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  urls, index, onClose, onPrev, onNext,
}: {
  urls: string[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const hasPrev = urls.length > 1
  const hasNext = urls.length > 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm tabular-nums">
        {index + 1} / {urls.length}
      </div>

      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Prev */}
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[index]}
        alt={`Photo ${index + 1}`}
        onClick={e => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
      />

      {/* Next */}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Dot indicators */}
      {urls.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
      )}
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
