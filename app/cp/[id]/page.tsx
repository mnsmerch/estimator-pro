'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'
import type { CabinetEstimateRecord } from '@/lib/firebase/cabinetEstimates'
import type { CompanySettings } from '@/types/settings'
import { calculateCabinet, sumCabinetCustomItems } from '@/types/cabinetEstimate'

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCityFromAddress(address: string): string {
  const parts = address.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
  const cityChunk = parts[1] ?? ''
  return cityChunk.replace(/\s+[A-Za-z]{2}\s+[\d-]+$/, '').replace(/\s+[A-Za-z]{2}$/, '').trim()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CabinetProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [estimate,  setEstimate]  = useState<CabinetEstimateRecord | null>(null)
  const [company,   setCompany]   = useState<CompanySettings>(DEFAULT_COMPANY)
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [applyDiscount, setApplyDiscount] = useState(true)
  const [logoLoaded,    setLogoLoaded]    = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Signature
  const [sigName,    setSigName]    = useState('')
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null)
  const [agreed,     setAgreed]     = useState(false)
  const [signing,    setSigning]    = useState(false)
  const [signed,     setSigned]     = useState(false)
  const [sending,          setSending]          = useState(false)
  const [sendDone,         setSendDone]         = useState(false)
  const [sendError,        setSendError]        = useState<string | null>(null)
  const [invoiceStatus,    setInvoiceStatus]    = useState<'idle'|'creating'|'done'|'error'>('idle')
  const [depositInvoiceUrl,setDepositInvoiceUrl]= useState<string | null>(null)
  const [retryInvoice,     setRetryInvoice]     = useState(false)
  const [retryInvoiceError,setRetryInvoiceError]= useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/cabinet-proposal/${id}`)
        if (!res.ok) {
          const json = await res.json() as { error?: string }
          throw new Error(json.error ?? `HTTP ${res.status}`)
        }
        const json = await res.json() as {
          estimate: CabinetEstimateRecord
          company: CompanySettings
        }
        const est = json.estimate
        setEstimate(est)
        setSigned(est.status === 'approved')
        setSigName(est.signatureName ?? '')
        setCompany(json.company)
        setLoading(false)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
    load()
  }, [id])

  // ── Pricing ────────────────────────────────────────────────────────────────
  const bd = estimate ? calculateCabinet(estimate) : null
  const customTotal    = sumCabinetCustomItems(estimate?.customItems)
  const computedSubtotal = (bd?.total ?? 0) + customTotal
  // Estimator-only manual subtotal override takes precedence when set
  const subtotalOverride = (estimate?.subtotalOverride != null && estimate.subtotalOverride > 0) ? estimate.subtotalOverride : null
  const subtotal       = subtotalOverride ?? computedSubtotal
  const discountAmount = applyDiscount ? Math.round(subtotal * 0.10 * 100) / 100 : 0
  const discounted     = subtotal - discountAmount
  const taxRate        = estimate?.salesTaxRate ?? null
  const taxAmount      = taxRate != null ? Math.round(discounted * taxRate * 100) / 100 : 0
  const totalWithTax   = discounted + taxAmount
  const depositPercent = 0.20
  const depositAmount  = Math.round(totalWithTax * depositPercent * 100) / 100
  const balanceDue     = Math.round((totalWithTax - depositAmount) * 100) / 100


  const isManualEstimate = !!estimate && !estimate.clientContactId
  const missingFields    = isManualEstimate ? [
    !estimate!.clientName?.trim()  && 'Name',
    !estimate!.address?.trim()     && 'Address',
    !estimate!.clientEmail?.trim() && 'Email',
    !estimate!.clientPhone?.trim() && 'Phone',
  ].filter(Boolean) as string[] : []
  const canInteract = !isManualEstimate || missingFields.length === 0

  // Poll for invoice status when signed but no invoice yet
  useEffect(() => {
    if (!signed || invoiceStatus !== 'idle') return
    let stopped = false; let attempts = 0
    async function poll() {
      if (stopped || attempts >= 60) return; attempts++
      try {
        const res  = await fetch(`/api/cabinet-proposal/${id}`)
        const json = await res.json() as { estimate?: { invoiceCreated?: boolean; depositInvoiceUrl?: string } }
        if (json.estimate?.invoiceCreated) {
          setInvoiceStatus('done')
          if (json.estimate.depositInvoiceUrl) setDepositInvoiceUrl(json.estimate.depositInvoiceUrl)
          stopped = true; return
        }
      } catch { /* keep polling */ }
      if (!stopped) setTimeout(poll, 5000)
    }
    const t = setTimeout(poll, 3000)
    return () => { stopped = true; clearTimeout(t) }
  }, [signed, invoiceStatus, id])

  async function handleSign() {
    if (!sigName.trim() || !agreed || !sigDataUrl || !estimate) return
    setSigning(true)
    try {
      const acceptRes = await fetch('/api/accept-estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimateId:       id,
          estimateType:     'cabinet',
          signatureName:    sigName.trim(),
          signatureDataUrl: sigDataUrl,
          depositAmount,
          balanceDue,
          depositPercent,
          grandTotal:       totalWithTax,
          taxRate:          taxRate ?? null,
          taxCity:          parseCityFromAddress(estimate.address ?? ''),
          estimateNumber:   estimate.estimateNumber ?? null,
          ...(estimate.clientContactId ? {
            contactId:    estimate.clientContactId,
            contactName:  estimate.clientName,
            contactEmail: estimate.clientEmail,
            contactPhone: estimate.clientPhone,
            itemLabel:    `${applyDiscount ? '10% off ' : ''}Cabinet Painting`,
            company: {
              name: company.name, phone: company.phone, email: company.email,
              website: company.website, streetAddress: company.streetAddress, cityStateZip: company.cityStateZip,
            },
          } : {}),
        }),
      })
      if (!acceptRes.ok) {
        const json = await acceptRes.json() as { error?: string }
        throw new Error(json.error ?? `Failed (${acceptRes.status})`)
      }
      const acceptJson = await acceptRes.json() as { depositInvoiceUrl?: string }
      setSigned(true)
      setEstimate(prev => prev ? { ...prev, status: 'approved', signatureName: sigName.trim() } : prev)

      if (estimate.clientContactId) {
        if (acceptJson.depositInvoiceUrl) { setInvoiceStatus('done'); setDepositInvoiceUrl(acceptJson.depositInvoiceUrl) }
        else setInvoiceStatus('done')
      }

      // Work order
      try {
        await fetch('/api/work-orders/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estimateId:      id,
            estimateType:    'cabinet',
            clientName:      estimate.clientName,
            clientAddress:   estimate.address ?? '',
            clientEmail:     estimate.clientEmail,
            clientPhone:     estimate.clientPhone,
            clientContactId: estimate.clientContactId ?? '',
            scopeOfWork:     estimate.scope?.projectDescription ?? '',
            jobType:         'Cabinet',
            projectTotal:    totalWithTax > 0 ? totalWithTax.toFixed(2) : '',
          }),
        })
      } catch { /* non-blocking */ }

      // Manual estimate: fire accept webhook
      if (isManualEstimate) {
        try {
          await fetch('https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/5590c13c-51a2-4ccf-9446-45f85557c79c', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              estimateId:     id,
              callbackUrl:    `${window.location.origin}/api/webhook/attach-contact`,
              clientName:     estimate.clientName,
              clientEmail:    estimate.clientEmail,
              clientPhone:    estimate.clientPhone,
              clientAddress1: (estimate.address ?? '').split(',')[0]?.trim() ?? '',
              estimateType:   'cabinet',
              estimateUrl:    `${window.location.origin}/cp/${id}`,
              grandTotal:     Math.round(totalWithTax * 100) / 100,
              depositAmount:  Math.round(depositAmount * 100) / 100,
              balanceDue:     Math.round(balanceDue * 100) / 100,
              depositPercent, taxRate: taxRate ?? 0,
            }),
          })
        } catch { /* non-blocking */ }
      }

    } catch (err) {
      console.error('Failed to accept estimate:', err)
      alert('Failed to save signature. Please try again.')
    } finally {
      setSigning(false)
    }
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (loadError || !estimate) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center">
          <p className="text-red-600 font-medium">{loadError ?? 'Estimate not found.'}</p>
        </div>
      </div>
    )
  }

  const hasPhotos = estimate.photoUrls.length > 0
  const hasScope  = !!(estimate.scope.projectDescription || estimate.scope.prepWork || estimate.scope.paintProcess || estimate.scope.finalTouches || estimate.scope.paintProducts)

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* ── Company header ──────────────────────────────────────────────── */}
        <div className="bg-brand-700 text-white rounded-2xl p-5 sm:p-7">
          {/* Row 1: logo + name + date */}
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
              <p className="text-brand-300 text-xs uppercase tracking-wide">Cabinet Estimate</p>
              <p className="text-sm font-semibold mt-0.5 whitespace-nowrap">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          {/* Row 2: contact details */}
          <div className="mt-3 pt-3 border-t border-brand-600 space-y-0.5">
            <p className="text-brand-200 text-sm">{company.streetAddress} · {company.cityStateZip}</p>
            <p className="text-brand-200 text-sm">{[company.phone, company.email].filter(Boolean).join(' · ')}</p>
            {company.website      && <p className="text-brand-200 text-sm">{company.website}</p>}
            {company.licenseNumber && <p className="text-brand-200 text-sm">Lic# {company.licenseNumber}</p>}
          </div>
        </div>

        {/* ── Client info ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Prepared For</p>
          <p className="text-xl font-bold text-gray-900">{estimate.clientName || 'Client'}</p>
          {estimate.address     && <p className="text-sm text-gray-500 mt-1">{estimate.address}</p>}
          {estimate.clientPhone && <p className="text-sm text-gray-500 mt-0.5">{estimate.clientPhone}</p>}
          {estimate.clientEmail && <p className="text-sm text-gray-500 mt-0.5">{estimate.clientEmail}</p>}
        </div>

        {/* ── Scope of work ───────────────────────────────────────────────── */}
        {hasScope && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-900">Scope of Work</h2>
            {estimate.scope.projectDescription && <ScopeBlock label="Project Description" text={estimate.scope.projectDescription} />}
            {estimate.scope.prepWork           && <ScopeBlock label="Prep Work"           text={estimate.scope.prepWork} />}
            {estimate.scope.paintProcess       && <ScopeBlock label="Paint Process"       text={estimate.scope.paintProcess} />}
            {estimate.scope.finalTouches       && <ScopeBlock label="Final Touches"       text={estimate.scope.finalTouches} />}
            {estimate.scope.paintProducts      && <ScopeBlock label="Paint Products"      text={estimate.scope.paintProducts} />}
          </div>
        )}

        {/* ── Photos ──────────────────────────────────────────────────────── */}
        {hasPhotos && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="text-base font-bold text-gray-900 mb-3">Project Photos</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {estimate.photoUrls.map((url, idx) => {
                const note = (estimate as typeof estimate & { photoNotes?: string[] }).photoNotes?.[idx]
                return (
                  <div key={url} className="flex flex-col rounded-xl overflow-hidden border border-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={note || `Photo ${idx + 1}`}
                      className="w-full aspect-square object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxIndex(idx)}
                    />
                    {note && (
                      <p className="px-2 py-1.5 text-xs text-gray-600 bg-white border-t border-gray-100 leading-snug">{note}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Discount toggle ─────────────────────────────────────────────── */}
        <div className={`rounded-2xl border-2 p-5 transition-colors ${
          applyDiscount ? 'bg-green-50 border-green-400' : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-base font-bold text-gray-900">Sign Today &amp; Save 10%</p>
              <p className="text-sm text-gray-600 mt-0.5">
                Accept this estimate today and save{' '}
                <span className="font-semibold text-green-700">{fmtD(subtotal * 0.10)}</span>{' '}
                off your project.
              </p>
              {applyDiscount && (
                <p className="text-sm font-semibold text-green-700 mt-2">
                  ✓ 10% discount applied — {fmtD(discountAmount)} savings included in your total
                </p>
              )}
            </div>
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

        {/* ── Pricing summary ─────────────────────────────────────────────── */}
        {bd && (
          <div className="bg-white rounded-[18px] border border-[oklch(0.93_0.006_80)] shadow-[0_1px_2px_rgba(20,40,30,0.04),0_12px_32px_rgba(20,40,30,0.08)]">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[oklch(0.94_0.004_140)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[oklch(0.52_0.13_150)]">Your Estimate</p>
              <h2 className="mt-1.5 text-lg font-bold text-[oklch(0.3_0.012_250)]">Simple, all-in pricing.</h2>
            </div>

            <div className="px-6 pt-2 pb-6">

              {/* Cabinet work shown as a single lump-sum line (full scope is in the Scope of Work section) */}
              <div className="pt-1">
                <PriceLine label="Cabinet Refinishing" value={fmtD(subtotal)} />
                {applyDiscount && (
                  <div className="flex justify-between items-center gap-4 py-[9px]">
                    <span className="text-sm font-semibold text-[oklch(0.52_0.13_150)]">Discount (10% — Sign Today)</span>
                    <span className="text-sm font-semibold text-[oklch(0.52_0.13_150)] tabular-nums">− {fmtD(discountAmount)}</span>
                  </div>
                )}
                {taxRate != null && (
                  <div className="flex justify-between items-center gap-4 py-[9px]">
                    <span className="text-sm text-[oklch(0.5_0.01_250)]">
                      Sales Tax ({(taxRate * 100).toFixed(1)}%{parseCityFromAddress(estimate.address) ? ` — ${parseCityFromAddress(estimate.address)}` : ''})
                    </span>
                    <span className="text-sm text-[oklch(0.3_0.012_250)] tabular-nums">+ {fmtD(taxAmount)}</span>
                  </div>
                )}
              </div>

              {/* Project total */}
              <div className="border-t border-[oklch(0.94_0.004_140)] mt-1 pt-4 flex justify-between items-center gap-4">
                <span className="font-bold text-[oklch(0.3_0.012_250)]">Project total</span>
                <span className="text-[22px] font-bold text-[oklch(0.3_0.012_250)] tabular-nums">{fmtD(totalWithTax)}</span>
              </div>

              {/* Deposit */}
              <div className="mt-5 rounded-[14px] p-[22px] bg-[oklch(0.96_0.035_150)] border border-[oklch(0.89_0.06_150)]">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="font-bold text-[oklch(0.4_0.1_150)]">Due today</p>
                    <p className="text-xs mt-1 text-[oklch(0.5_0.01_250)]">Reserves your project start date · {Math.round(depositPercent * 100)}%</p>
                  </div>
                  <span className="text-[30px] font-extrabold leading-none text-[oklch(0.52_0.13_150)] tabular-nums shrink-0">{fmtD(depositAmount)}</span>
                </div>
                <div className="border-t border-[oklch(0.89_0.06_150)] mt-4 pt-3 flex justify-between items-center gap-4">
                  <span className="text-sm text-[oklch(0.5_0.01_250)]">Remaining balance · billed on completion</span>
                  <span className="text-sm text-[oklch(0.5_0.01_250)] tabular-nums shrink-0">{fmtD(balanceDue)}</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Terms & Conditions ──────────────────────────────────────────── */}
        <TermsAndConditions />

        {/* ── Signature ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
          {signed ? (
            <div className="text-center py-4 space-y-2">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
              {/* Invoice status */}
              <div className="mt-4">
                {invoiceStatus === 'done' && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                      Invoice Sent
                    </div>
                    {depositInvoiceUrl && <a href={depositInvoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm rounded-xl transition-colors">Pay Deposit Now</a>}
                  </div>
                )}
                {invoiceStatus === 'idle' && (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-amber-800">Preparing your invoice…</p>
                      <p className="text-xs text-amber-600 mt-0.5">Your deposit invoice will be sent to your email shortly.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-900 mb-1">Accept This Estimate</h3>
              <p className="text-sm text-gray-400 mb-5">
                By signing below you authorize {company.name} to proceed with the work described above at the price shown.
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
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Full Name</label>
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
                      <button onClick={() => setSigDataUrl(null)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                  <SignaturePad onSign={setSigDataUrl} cleared={!sigDataUrl} />
                  {!sigDataUrl && <p className="mt-1.5 text-xs text-gray-400">Draw your signature above using your finger or mouse.</p>}
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

        {/* ── Not ready to sign ──────────────────────────────────────────── */}
        {!signed && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
            <p className="text-sm font-semibold text-gray-700 mb-1">Not ready to sign right now?</p>
            <p className="text-sm text-gray-400 mb-4">
              We&apos;ll send this estimate to your email so you can review and sign it later.
            </p>
            {sendDone ? (
              <p className="text-sm font-semibold text-green-600">✓ Estimate sent! Check your email.</p>
            ) : (
              <>
                <button
                  onClick={async () => {
                    if (!estimate || sending) return
                    setSending(true)
                    setSendError(null)
                    try {
                      const estimateUrl = `${window.location.origin}/cp/${id}`
                      const res = await fetch('/api/send-estimate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clientName:      estimate.clientName,
                          clientAddress:   estimate.address,
                          clientPhone:     estimate.clientPhone     ?? '',
                          clientEmail:     estimate.clientEmail     ?? '',
                          clientContactId: '',
                          clientFolderId:  '',
                          estimateUrl,
                          estimateId:      id,
                          estimateType:    'cabinet',
                        }),
                      })
                      const json = await res.json() as { success?: boolean; error?: string }
                      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to send')
                      setSendDone(true)
                    } catch (err) {
                      setSendError(err instanceof Error ? err.message : 'Something went wrong')
                    } finally {
                      setSending(false)
                    }
                  }}
                  disabled={sending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                  )}
                  {sending ? 'Sending…' : 'Send Estimate'}
                </button>
                {sendError && <p className="text-xs text-red-500 mt-2">{sendError}</p>}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-6">
          {company.name} · {company.phone} · {company.email}
        </p>

      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && estimate.photoUrls.length > 0 && (
        <Lightbox
          urls={estimate.photoUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => i !== null ? (i - 1 + estimate.photoUrls.length) % estimate.photoUrls.length : 0)}
          onNext={() => setLightboxIndex(i => i !== null ? (i + 1) % estimate.photoUrls.length : 0)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between items-center gap-4 py-[9px]">
      <span className="text-sm text-[oklch(0.5_0.01_250)]">{label}</span>
      {value != null && (
        <span className="text-sm font-medium text-[oklch(0.3_0.012_250)] tabular-nums shrink-0">{value}</span>
      )}
    </div>
  )
}

function ScopeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  )
}

const DEFAULT_TERMS = `WARRANTY

• Vanhousing Painters LLC gives workmanship warranty for a period of 3 years from date of significant completion of the project. If paint failure appears, we will supply labor and materials to correct the condition without cost. This warranty is in lieu of all other warranties, expressed or implied. Our responsibility is limited to correcting the condition as indicated above.

• This warranty excludes, and in no event will Vanhousing Painters LLC be responsible for consequential or incidental damage caused by accident or abuse, temperature or humidity changes, settlement, or moisture.

INSURANCE

• Vanhousing Painters LLC carries full liability and auto insurance.

• Certificate of insurance available upon request.

STANDARDS

• All work is to be completed in a workmanlike manner according to standard practices.

• All work will be done as per standards of the PCA (Painting Contractors of America).

GENERAL CONDITIONS

• Any changes or additional work must be agreed upon in writing before work is performed.

• Price is valid for 90 days, unless otherwise noted.

PAYMENT TERMS

• We require a 20% deposit upfront to secure your project start date.

• The project will be billed in full and due upon completion of the scope.`

function TermsAndConditions() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <span className="text-sm font-bold text-gray-900">Terms &amp; Conditions</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="mt-4 text-xs text-gray-600 whitespace-pre-line leading-relaxed">{DEFAULT_TERMS}</div>
        </div>
      )}
    </div>
  )
}

function Lightbox({ urls, index, onClose, onPrev, onNext }: {
  urls: string[]; index: number; onClose: () => void; onPrev: () => void; onNext: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm tabular-nums">{index + 1} / {urls.length}</div>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
      {urls.length > 1 && (
        <button onClick={e => { e.stopPropagation(); onPrev() }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[index]} alt={`Photo ${index + 1}`} onClick={e => e.stopPropagation()} className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" />
      {urls.length > 1 && (
        <button onClick={e => { e.stopPropagation(); onNext() }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        </button>
      )}
      {urls.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30'}`} />)}
        </div>
      )}
    </div>
  )
}

function SignaturePad({ onSign, cleared }: { onSign: (dataUrl: string) => void; cleared: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const lastPos   = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!cleared) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
  }, [cleared])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
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
