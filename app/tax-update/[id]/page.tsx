'use client'

import { useState, useEffect, use } from 'react'
import type { EstimateData } from '@/types/estimate'
import type { BusinessRules, ProductionConstants, PaintProduct, ProductionRates, CompanySettings } from '@/types/settings'

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const BRAND_LABELS: Record<string, string> = {
  superPaint: 'Sherwin-Williams Super Paint',
  duration:   'Sherwin-Williams Duration',
  emerald:    'Sherwin-Williams Emerald',
  emeraldRR:  'Sherwin-Williams Emerald Rain Refresh',
}

export default function TaxUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [estimate, setEstimate]   = useState<EstimateData | null>(null)
  const [company,  setCompany]    = useState<CompanySettings | null>(null)
  const [loading,  setLoading]    = useState(true)
  const [error,    setError]      = useState<string | null>(null)
  const [logoLoaded, setLogoLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/proposal/${id}`)
      .then(r => r.json())
      .then((d: { estimate: EstimateData; company: CompanySettings; rules: BusinessRules; constants: ProductionConstants; paintProducts: PaintProduct[]; rates: ProductionRates }) => {
        if (!d.estimate) { setError('Estimate not found'); setLoading(false); return }
        setEstimate(d.estimate)
        setCompany(d.company)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !estimate || !company) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-gray-500">{error ?? 'Not found'}</p>
    </div>
  )

  // Pull corrected values stored by the tax correction tool
  const est = estimate as EstimateData & {
    signedGrandTotal?:    number
    signedDepositAmount?: number
    signedBalanceDue?:    number
    salesTaxRate?:        number | null
    signedTaxCity?:       string
    signatureDate?:       string
    signatureName?:       string
  }

  const grandTotal    = est.signedGrandTotal    ?? 0
  const depositPaid   = est.signedDepositAmount ?? 0
  const balanceDue    = est.signedBalanceDue    ?? 0
  const taxRate       = est.salesTaxRate        ?? 0
  const taxCity       = est.signedTaxCity       ?? ''

  // Back-calculate pre-tax from stored grand total + tax rate
  const preTaxTotal   = taxRate > 0 ? Math.round((grandTotal / (1 + taxRate)) * 100) / 100 : grandTotal
  const taxAmount     = Math.round((grandTotal - preTaxTotal) * 100) / 100
  const brandLabel    = BRAND_LABELS[est.selectedBrand ?? 'superPaint'] ?? est.selectedBrand ?? 'Exterior Paint'

  const scopeParts = [
    est.scopeProject, est.scopePrepWork, est.scopePainting,
    est.scopeCleanUp, est.scopeWalkThrough,
  ].filter(Boolean) as string[]

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Company header ─────────────────────────────────────────── */}
        <div className="bg-brand-700 text-white rounded-2xl p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {company.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                  onLoad={() => setLogoLoaded(true)}
                  className={`h-12 w-12 sm:h-14 sm:w-14 object-contain rounded-lg bg-white p-1.5 shrink-0 shadow-sm transition-opacity duration-300 ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}
                />
              )}
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">{company.name}</h1>
            </div>
            <div className="text-right shrink-0">
              <p className="text-brand-300 text-xs uppercase tracking-wide">Date</p>
              <p className="text-sm font-semibold mt-0.5 whitespace-nowrap">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-brand-600 space-y-0.5">
            <p className="text-brand-200 text-sm">{company.streetAddress} · {company.cityStateZip}</p>
            <p className="text-brand-200 text-sm">{company.phone} · {company.email}</p>
            {company.website && <p className="text-brand-200 text-sm">{company.website}</p>}
          </div>
        </div>

        {/* ── Notice banner ──────────────────────────────────────────── */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">Updated Estimate — Sales Tax Correction</p>
              <p className="text-sm text-amber-700 mt-1">
                Sales tax of <strong>{(taxRate * 100).toFixed(1)}%{taxCity ? ` (${taxCity})` : ''}</strong> was not included in your original proposal due to a missing ZIP code. This updated estimate reflects the corrected total. Your deposit has been applied and the adjusted remaining balance is shown below.
              </p>
            </div>
          </div>
        </div>

        {/* ── Prepared for ───────────────────────────────────────────── */}
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

        {/* ── Original signature confirmation ────────────────────────── */}
        {est.signatureName && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 flex items-center gap-3">
            <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm text-green-700">
              Original estimate signed by <strong>{est.signatureName}</strong>{est.signatureDate ? ` on ${est.signatureDate}` : ''}.
            </p>
          </div>
        )}

        {/* ── Updated pricing breakdown ───────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-800 text-white text-center text-xs font-bold py-2.5 tracking-widest uppercase">
            Updated Pricing Breakdown
          </div>
          <div className="p-6 space-y-3 text-sm">

            {/* Paint product */}
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Paint Selected</span>
              <span className="font-semibold text-brand-700">{brandLabel}</span>
            </div>

            {/* Pre-tax total */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total (after 10% discount)</span>
              <span className="font-medium text-gray-900 tabular-nums">{fmtD(preTaxTotal)}</span>
            </div>

            {/* Tax */}
            {taxAmount > 0 && (
              <div className="flex justify-between items-center text-gray-700">
                <span>Sales Tax ({(taxRate * 100).toFixed(1)}%{taxCity ? ` — ${taxCity}` : ''})</span>
                <span className="tabular-nums font-medium">+ {fmtD(taxAmount)}</span>
              </div>
            )}

            {/* Updated total */}
            <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
              <span className="font-bold text-gray-900">Updated Total</span>
              <span className="font-bold text-gray-900 tabular-nums text-lg">{fmtD(grandTotal)}</span>
            </div>

            {/* Deposit paid */}
            <div className="flex justify-between items-center text-green-700 bg-green-50 rounded-xl px-4 py-3">
              <div>
                <p className="font-semibold">Deposit Already Paid ✓</p>
                <p className="text-xs text-green-600 mt-0.5">No additional deposit required</p>
              </div>
              <span className="font-bold tabular-nums text-lg">− {fmtD(depositPaid)}</span>
            </div>

            {/* Remaining balance */}
            <div className="bg-brand-50 border-2 border-brand-200 rounded-xl px-5 py-4 flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-brand-700">Remaining Balance Due on Completion</p>
                <p className="text-xs text-brand-500 mt-0.5">Due upon project completion</p>
              </div>
              <span className="text-2xl font-bold text-brand-700 tabular-nums">{fmtD(balanceDue)}</span>
            </div>
          </div>
        </div>

        {/* ── What this means ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-3">What This Means For You</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              <span>Your deposit of <strong>{fmtD(depositPaid)}</strong> has been received and applied — nothing more is due now.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              <span>The remaining balance of <strong>{fmtD(balanceDue)}</strong> is due upon completion of the project.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
              <span>The only change is the addition of {(taxRate * 100).toFixed(1)}% sales tax ({fmtD(taxAmount)}), required by law. The scope, paint selection ({brandLabel}), and pricing of your project remain identical.</span>
            </li>
          </ul>
          <p className="mt-4 text-sm text-gray-500">
            Please reply to this email to confirm you approve the adjustment. If you have any questions, don&apos;t hesitate to reach out — we&apos;re happy to walk you through the numbers.
          </p>
        </div>

        {/* ── Scope of Work ──────────────────────────────────────────── */}
        {scopeParts.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Scope of Work (Unchanged)</h3>
            <div className="space-y-3 text-sm text-gray-700">
              {est.scopeProject    && <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Project</p><p className="whitespace-pre-line">{est.scopeProject}</p></div>}
              {est.scopePrepWork   && <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Prep Work</p><p className="whitespace-pre-line">{est.scopePrepWork}</p></div>}
              {est.scopePainting   && <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Painting</p><p className="whitespace-pre-line">{est.scopePainting}</p></div>}
              {est.scopeCleanUp   && <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Clean Up</p><p className="whitespace-pre-line">{est.scopeCleanUp}</p></div>}
              {est.scopeWalkThrough && <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Walk Through</p><p className="whitespace-pre-line">{est.scopeWalkThrough}</p></div>}
            </div>
          </div>
        )}

        {/* ── Project Photos ─────────────────────────────────────────── */}
        {(estimate.photoUrls?.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Project Photos ({estimate.photoUrls!.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {estimate.photoUrls!.map((url, idx) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="aspect-square w-full object-cover rounded-xl hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-6">
          {company.name} · {company.phone} · {company.email}
        </p>

      </div>
    </div>
  )
}
