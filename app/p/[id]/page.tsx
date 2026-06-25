'use client'

import { useState, useEffect, useMemo, use, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { buildApplicationList } from '@/lib/applicationList'
import { calcEstimate, calcMarkup, calcStructureAddonSubtotal, calcStructureAddonGallons, calcStructureAddonDetails } from '@/lib/estimateEngine'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
  DEFAULT_COMPANY,
} from '@/lib/defaultSettings'
import type { EstimateData } from '@/types/estimate'
import { getDefaultScopeForBrand } from '@/types/estimate'
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

function parseAddress(address: string): { address1: string; city: string; state: string; zip: string } {
  // Strip country suffix — Google Places appends ", USA"
  const cleaned    = address.replace(/,?\s*(?:USA|United States)\s*$/i, '').trim()
  const zipMatch   = cleaned.match(/(\d{5}(?:-\d{4})?)/)
  const zip        = zipMatch ? zipMatch[1] : ''
  const stateMatch = cleaned.match(/\b([A-Z]{2})\s+\d{5}/)
  const state      = stateMatch ? stateMatch[1] : ''
  const parts      = cleaned.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
  const address1   = parts[0] ?? ''
  const cityRaw    = parts[1] ?? ''
  const city       = cityRaw.replace(/\s+[A-Z]{2}\s+[\d-]+$/, '').replace(/\s+[A-Z]{2}$/, '').trim()
  return { address1, city, state, zip }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()

  const [estimate, setEstimate]       = useState<EstimateData | null>(null)
  const [rules, setRules]             = useState<BusinessRules>(DEFAULT_BUSINESS_RULES)
  const [constants, setConstants]     = useState<ProductionConstants>(DEFAULT_PRODUCTION_CONSTANTS)
  const [paintProducts, setPaintProducts] = useState<PaintProduct[]>(DEFAULT_PAINT_PRODUCTS)
  const [rates, setRates]             = useState<ProductionRates>(DEFAULT_RATES)
  const [company, setCompany]         = useState<CompanySettings>(DEFAULT_COMPANY)
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState<string | null>(null)

  // Customer-interactive state
  const [selectedBrand,      setSelectedBrand]      = useState('superPaint')
  const [includeWood,        setIncludeWood]        = useState(false)
  const [includedCustomIds,  setIncludedCustomIds]  = useState<Set<string>>(new Set())
  const [applyDiscount,      setApplyDiscount]      = useState(true)

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
  const [justSigned,  setJustSigned]  = useState(false) // true only when signed in this session
  const [pdfStatus,   setPdfStatus]   = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [pdfLink,     setPdfLink]     = useState<string | null>(null)
  const [pdfError,    setPdfError]    = useState<string | null>(null)
  const [savedToDrive, setSavedToDrive] = useState(false)
  const [invoiceStatus, setInvoiceStatus]   = useState<'idle' | 'creating' | 'done' | 'error'>('idle')
  const [invoiceError,  setInvoiceError]    = useState<string | null>(null)
  const [depositInvoiceUrl, setDepositInvoiceUrl] = useState<string | null>(null)

  const [sending,   setSending]   = useState(false)
  const [sendDone,  setSendDone]  = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Retroactive GHL invoice creation (admin only, for manually-created estimates)
  const [retryInvoice,      setRetryInvoice]      = useState(false)
  const [retryInvoiceError, setRetryInvoiceError] = useState<string | null>(null)

  // Change order state (admin only)
  const [showChangeOrder,   setShowChangeOrder]   = useState(false)
  const [coItems,           setCoItems]           = useState<{ id: string; description: string; price: number }[]>([])
  const [coNotes,           setCoNotes]           = useState('')
  const [coSaving,          setCoSaving]          = useState(false)
  const [coError,           setCoError]           = useState<string | null>(null)
  const [coResult,          setCoResult]          = useState<{ newGrandTotal: number; newBalanceDue: number; changeOrderTotal: number } | null>(null)
  // Load existing change orders from estimate
  const existingChangeOrders = (estimate as (typeof estimate & { changeOrders?: typeof coItems }) | null)?.changeOrders ?? []
  const isModified = !!(estimate as (typeof estimate & { isModified?: boolean }) | null)?.isModified

  function addCoItem() {
    setCoItems(prev => [...prev, { id: crypto.randomUUID(), description: '', price: 0 }])
  }
  function updateCoItem(id: string, field: 'description' | 'price', value: string | number) {
    setCoItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }
  function removeCoItem(id: string) {
    setCoItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleSaveChangeOrder() {
    if (!coItems.length || coSaving) return
    setCoSaving(true)
    setCoError(null)
    try {
      const res  = await fetch('/api/change-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ estimateId: id, items: coItems, notes: coNotes }),
      })
      const json = await res.json() as { success?: boolean; error?: string; changeOrderTotal?: number; newGrandTotal?: number; newBalanceDue?: number }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed')
      setCoResult({ newGrandTotal: json.newGrandTotal!, newBalanceDue: json.newBalanceDue!, changeOrderTotal: json.changeOrderTotal! })
      setShowChangeOrder(false)
      // Update local estimate to reflect modified state
      setEstimate(prev => prev ? { ...(prev as object), isModified: true, changeOrders: coItems } as typeof prev : prev)
    } catch (err) {
      setCoError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setCoSaving(false)
    }
  }

  // Poll for invoice status when signed but no invoice yet
  useEffect(() => {
    // Only poll when signed in this session and invoice is still pending
    if (!signed || !justSigned || invoiceStatus !== 'idle') return

    let stopped = false
    let attempts = 0
    const MAX_ATTEMPTS = 60 // 5 min at 5s intervals

    async function poll() {
      if (stopped || attempts >= MAX_ATTEMPTS) return
      attempts++
      try {
        const res  = await fetch(`/api/proposal/${id}`)
        const json = await res.json() as { estimate?: { invoiceCreated?: boolean; depositInvoiceUrl?: string } }
        if (json.estimate?.invoiceCreated) {
          setInvoiceStatus('done')
          if (json.estimate.depositInvoiceUrl) {
            setDepositInvoiceUrl(json.estimate.depositInvoiceUrl)
          }
          stopped = true
          return
        }
      } catch { /* ignore — keep polling */ }
      if (!stopped) setTimeout(poll, 5000)
    }

    // Start after a short delay to give GHL time to respond
    const timer = setTimeout(poll, 3000)
    return () => { stopped = true; clearTimeout(timer) }
  }, [signed, justSigned, invoiceStatus, id])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/proposal/${id}`)
        if (!res.ok) {
          const json = await res.json() as { error?: string }
          throw new Error(json.error ?? `HTTP ${res.status}`)
        }
        const json = await res.json() as {
          estimate: EstimateData
          rules: BusinessRules
          constants: ProductionConstants
          paintProducts: PaintProduct[]
          rates: ProductionRates
          company: CompanySettings
        }
        const est = json.estimate
        setEstimate(est)
        setSelectedBrand(est.selectedBrand ?? 'superPaint')
        setIncludeWood(est.woodReplacementOpen ?? false)
        if (est.customItemsOpen) {
          setIncludedCustomIds(new Set((est.customItems ?? []).filter(i => i.description && i.price > 0).map(i => i.id)))
        }
        setSigned(est.status === 'approved')
        setSigName(est.signatureName ?? '')
        // If already signed, resolve invoice status from stored data so we
        // don't show a stale "Preparing your invoice…" spinner on revisit
        if (est.status === 'approved') {
          const estAny = est as typeof est & { invoiceCreated?: boolean; depositInvoiceUrl?: string }
          if (estAny.invoiceCreated || estAny.depositInvoiceUrl) {
            setInvoiceStatus('done')
            if (estAny.depositInvoiceUrl) setDepositInvoiceUrl(estAny.depositInvoiceUrl)
          } else if (!est.clientContactId) {
            // Manual estimate — no GHL invoice will ever be created
            setInvoiceStatus('done')
          }
          // Otherwise leave as 'idle' so the poll can detect a pending invoice
        }
        setRules(json.rules)
        setConstants(json.constants)
        setPaintProducts(json.paintProducts)
        setRates(json.rates)
        setCompany(json.company)
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

  // Owner/client supplying paint — the estimate stored 'no-paint' products.
  // In that case the customer can't switch paint tiers, so use the stored
  // products directly instead of the brand preset.
  const clientProvidingPaint = (estimate?.selectedBodyPaint === 'no-paint')

  // Paint totals for the currently selected brand
  const totals = useMemo(() => {
    if (!estimate?.rows?.length) return null
    const brand = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
    // When client supplies paint, use the stored selections; otherwise the brand preset
    const bodyId   = clientProvidingPaint ? (estimate.selectedBodyPaint   ?? brand.bodyId)   : brand.bodyId
    const trimId   = clientProvidingPaint ? (estimate.selectedTrimPaint   ?? brand.trimId)   : brand.trimId
    const accentId = clientProvidingPaint ? (estimate.selectedAccentPaint ?? brand.accentId) : brand.accentId
    const stainId  = clientProvidingPaint ? (estimate.selectedStainPaint  ?? brand.stainId)  : brand.stainId
    const bodyPaint   = paintProducts.find(p => p.id === bodyId)   ?? emptyPaint
    const trimPaint   = paintProducts.find(p => p.id === trimId)   ?? emptyPaint
    const accentPaint = paintProducts.find(p => p.id === accentId) ?? emptyPaint
    const stainPaint  = paintProducts.find(p => p.id === stainId)  ?? emptyPaint
    const validRows   = estimate.rows.filter(r => r.applicationKey !== '')
    if (!validRows.length) return null
    return calcEstimate(validRows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint)
  }, [estimate, selectedBrand, clientProvidingPaint, paintProducts, appMap, rules, constants])

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

  const woodTotal   = includeWood ? woodTotalRaw : 0
  const customTotal = useMemo(() => {
    if (!estimate?.customItems?.length) return 0
    return estimate.customItems.reduce((sum, item) => {
      if (!item.description || !item.price) return sum
      return includedCustomIds.has(item.id) ? sum + item.price : sum
    }, 0)
  }, [estimate, includedCustomIds])

  const jobType = estimate?.jobType ?? 'exterior'

  // Structure subtotals (deck, pergola, fence, shed)
  const deckSubtotal = useMemo(() => {
    const addons = estimate?.deckAddons?.length
      ? estimate.deckAddons
      : estimate?.deckAddon
      ? [estimate.deckAddon]
      : []
    return addons.reduce((s, addon) =>
      s + calcStructureAddonSubtotal(addon, 1 / 20, appMap, rules, constants, paintProducts), 0)
  }, [estimate, appMap, rules, constants, paintProducts])

  const pergolaSubtotal = useMemo(() =>
    estimate?.pergolaAddon ? calcStructureAddonSubtotal(estimate.pergolaAddon, 0, appMap, rules, constants, paintProducts) : 0,
    [estimate, appMap, rules, constants, paintProducts])

  const fenceSubtotal = useMemo(() =>
    estimate?.fenceAddon ? calcStructureAddonSubtotal(estimate.fenceAddon, 0, appMap, rules, constants, paintProducts) : 0,
    [estimate, appMap, rules, constants, paintProducts])

  const shedSubtotal = useMemo(() =>
    estimate?.shedAddon ? calcStructureAddonSubtotal(estimate.shedAddon, 0, appMap, rules, constants, paintProducts) : 0,
    [estimate, appMap, rules, constants, paintProducts])

  // Paint product name labels for structure line items
  const deckPaintLabel = useMemo(() => {
    const addons = estimate?.deckAddons?.length
      ? estimate.deckAddons
      : estimate?.deckAddon ? [estimate.deckAddon] : []
    const ids = [...new Set(addons.filter(a => a.enabled).map(a => a.paintProductId))]
    if (ids.length === 1) return paintProducts.find(p => p.id === ids[0])?.name ?? null
    return null
  }, [estimate, paintProducts])

  const pergolaPaintLabel = useMemo(() =>
    estimate?.pergolaAddon?.enabled
      ? (paintProducts.find(p => p.id === estimate.pergolaAddon!.paintProductId)?.name ?? null)
      : null,
    [estimate, paintProducts])

  const fencePaintLabel = useMemo(() =>
    estimate?.fenceAddon?.enabled
      ? (paintProducts.find(p => p.id === estimate.fenceAddon!.paintProductId)?.name ?? null)
      : null,
    [estimate, paintProducts])

  const shedPaintLabel = useMemo(() =>
    estimate?.shedAddon?.enabled
      ? (paintProducts.find(p => p.id === estimate.shedAddon!.paintProductId)?.name ?? null)
      : null,
    [estimate, paintProducts])

  const structuresSubtotal = deckSubtotal + pergolaSubtotal + fenceSubtotal + shedSubtotal
  const hasStructures = structuresSubtotal > 0

  const paintingSubtotal  = jobType !== 'structures' ? (totals?.subtotal ?? 0) : 0
  const structTotal       = jobType !== 'exterior'   ? structuresSubtotal       : 0
  const computedSubtotal  = paintingSubtotal + structTotal + woodTotal + customTotal
  // Estimator-only manual subtotal override takes precedence when set
  const subtotalOverride  = (estimate?.subtotalOverride != null && estimate.subtotalOverride > 0) ? estimate.subtotalOverride : null
  const combinedSubtotal  = subtotalOverride ?? computedSubtotal
  // When the price is overridden, the per-item amounts no longer sum to the
  // shown subtotal, so hide them on the customer view — show labels only.
  const hideItemPrices    = subtotalOverride != null
  const discountAmount    = applyDiscount ? combinedSubtotal * 0.10 : 0
  const discounted        = combinedSubtotal - discountAmount
  const taxRate           = estimate?.salesTaxRate ?? null
  const taxAmount         = taxRate != null ? discounted * taxRate : 0
  const grandTotal        = discounted + taxAmount
  const depositPercent    = rules.depositPercent ?? 0.20
  const depositAmount     = grandTotal * depositPercent
  const balanceDue        = grandTotal - depositAmount

  // Cache grand total for list view (fire-and-forget, runs once after load)
  const cachedTotalSaved = useRef(false)
  useEffect(() => {
    if (!loading && grandTotal > 0 && !cachedTotalSaved.current) {
      cachedTotalSaved.current = true
      fetch('/api/cache-grand-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId: id, estimateType: 'exterior', grandTotal }),
      }).catch(() => {})
    }
  }, [loading, grandTotal, id])

  const hasWoodData   = (estimate?.woodReplacementRows ?? []).some(r => r.itemKey && (r.front + r.right + r.back + r.left) > 0)
  const hasCustomData = (estimate?.customItems ?? []).some(i => i.description && (i.price ?? 0) > 0)

  // Manual estimates (created from scratch, no GHL contact) need complete client info
  const isManualEstimate = !!estimate && !estimate.clientContactId
  const missingFields = isManualEstimate ? [
    !estimate!.clientName?.trim()    && 'Name',
    !estimate!.clientAddress?.trim() && 'Address',
    !estimate!.clientEmail?.trim()   && 'Email',
    !estimate!.clientPhone?.trim()   && 'Phone',
  ].filter(Boolean) as string[] : []
  const canInteract = !isManualEstimate || missingFields.length === 0

  async function handleSign() {
    if (!sigName.trim() || !agreed || !sigDataUrl || !estimate) return
    setSigning(true)
    let capturedPdfUrl: string | null = null
    try {
      const now = new Date()
      const signatureDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const fileTimestamp = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/,/g, '').replace(/:/g, '-').replace(/ /g, '_')

      // 1. Save signature + create GHL invoices atomically server-side
      const brandPresetForInvoice = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
      const itemLabel = `${applyDiscount ? '10% off ' : ''}Exterior Painting — ${clientProvidingPaint ? 'Labor (Paint by Owner)' : brandPresetForInvoice.label}`
      const acceptRes  = await fetch('/api/accept-estimate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          estimateId:     id,
          estimateType:   'exterior',
          signatureName:  sigName.trim(),
          signatureDataUrl: sigDataUrl,
          // Always send pricing so it gets stored — needed for the GHL callback flow
          depositAmount,
          balanceDue,
          depositPercent,
          grandTotal,
          taxRate:        taxRate ?? null,
          taxCity:        parseCityFromAddress(estimate.clientAddress),
          estimateNumber: estimate.estimateNumber ?? null,
          ...(estimate.clientContactId ? {
            contactId:      estimate.clientContactId,
            contactName:    estimate.clientName,
            contactEmail:   estimate.clientEmail,
            contactPhone:   estimate.clientPhone,
            itemLabel,
            company: {
              name:          company.name,
              phone:         company.phone,
              email:         company.email,
              website:       company.website,
              streetAddress: company.streetAddress,
              cityStateZip:  company.cityStateZip,
            },
          } : {}),
        }),
      })
      const acceptJson = await acceptRes.json() as { success?: boolean; error?: string; depositInvoiceUrl?: string }
      if (!acceptRes.ok || acceptJson.error) throw new Error(acceptJson.error ?? 'Failed to accept estimate')

      setSigned(true)
      setJustSigned(true)
      setEstimate(prev => prev ? { ...prev, status: 'approved', signatureName: sigName.trim() } : prev)

      // Set invoice status from server response
      if (estimate.clientContactId) {
        if (acceptJson.depositInvoiceUrl) {
          setInvoiceStatus('done')
          setDepositInvoiceUrl(acceptJson.depositInvoiceUrl)
        } else {
          setInvoiceStatus('done')
        }
      }

      // 2. Generate PDF (always) and try Drive upload if folder ID is set
      {
        setPdfStatus('uploading')
        const brandPreset = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
        const pdfData = {
          companyName:        company.name,
          companyAddress:     company.streetAddress,
          companyCityStateZip: company.cityStateZip,
          companyPhone:       company.phone,
          companyEmail:       company.email,
          companyWebsite:     company.website,
          companyLicense:     company.licenseNumber,
          companyLogoUrl:     company.logoUrl,
          clientName:         estimate.clientName,
          clientAddress:      estimate.clientAddress,
          clientPhone:        estimate.clientPhone,
          clientEmail:        estimate.clientEmail,
          scopeProject,
          scopePrepWork,
          scopePainting,
          scopeCleanUp,
          scopeWalkThrough,
          scopePaintProducts,
          totalColors,
          totalCoats,
          selectedBrandLabel: brandPreset.label,
          paintingSubtotal,
          woodTotal,
          customItems:        (estimate.customItems ?? []).filter(i => includedCustomIds.has(i.id) && i.description && i.price > 0),
          combinedSubtotal,
          applyDiscount,
          discountAmount,
          taxRate,
          taxCity:            parseCityFromAddress(estimate.clientAddress),
          taxAmount,
          grandTotal,
          depositPercent,
          depositAmount,
          balanceDue,
          signatureName:      sigName.trim(),
          signatureDate,
          signatureDataUrl:   sigDataUrl,
          generatedDate:      signatureDate,
        }

        const fileName = `${estimate.clientName} - Signed Contract - ${fileTimestamp}.pdf`

        try {
          const res = await fetch('/api/generate-pdf', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ data: pdfData, folderId: estimate.clientFolderId, fileName, contactId: estimate.clientContactId || undefined, estimateId: id }),
          })
          const json = await res.json() as {
            pdfBase64?: string; fileName?: string
            driveLink?: string; driveError?: string
            storageUrl?: string; storageError?: string
            ghlUrl?: string; ghlError?: string
            error?: string
          }

          if (json.error) {
            // Total failure (PDF couldn't even be generated)
            setPdfStatus('error')
            setPdfError(json.error)
          } else {
            // PDF was generated — trigger browser download
            if (json.pdfBase64) {
              const bytes = Uint8Array.from(atob(json.pdfBase64), c => c.charCodeAt(0))
              const blob  = new Blob([bytes], { type: 'application/pdf' })
              const url   = URL.createObjectURL(blob)
              const a     = document.createElement('a')
              a.href     = url
              a.download = json.fileName ?? fileName
              a.click()
              URL.revokeObjectURL(url)
            }
            // Show Drive link if successful, fall back to storage URL
            if (json.driveLink) {
              setPdfStatus('done')
              setPdfLink(json.driveLink)
              setSavedToDrive(true)
              capturedPdfUrl = json.driveLink
            } else if (json.storageUrl) {
              // Drive failed but Firebase Storage backup succeeded — treat as success
              setPdfStatus('done')
              setPdfLink(json.storageUrl)
              setSavedToDrive(false)
              capturedPdfUrl = json.storageUrl
            } else {
              setPdfStatus('error')
              setPdfError(json.driveError ?? 'Upload failed.')
              setPdfLink(null)
            }
          }
        } catch (err) {
          setPdfStatus('error')
          setPdfError(err instanceof Error ? err.message : String(err))
        }
      }

      // 3. Create work order (only on sign)
      try {
        const scopeParts = [scopeProject, scopePrepWork, scopePainting, scopeCleanUp, scopeWalkThrough].filter(Boolean)

        // Sum structure add-on labor/materials
        let structTotals = { hours: 0, landm: 0, paintCost: 0, sundries: 0 }
        try {
          const structAddonList = [
            ...(estimate.deckAddons?.length ? estimate.deckAddons.map(a => ({ addon: a, setup: 1/20 })) : estimate.deckAddon ? [{ addon: estimate.deckAddon, setup: 1/20 }] : []),
            ...(estimate.pergolaAddon ? [{ addon: estimate.pergolaAddon, setup: 0 }] : []),
            ...(estimate.fenceAddon   ? [{ addon: estimate.fenceAddon,   setup: 0 }] : []),
            ...(estimate.shedAddon    ? [{ addon: estimate.shedAddon,    setup: 0 }] : []),
          ]
          structTotals = structAddonList.reduce(
            (acc, { addon, setup }) => {
              const d = calcStructureAddonDetails(addon, setup, appMap, rules, constants, paintProducts)
              return { hours: acc.hours + d.hours, landm: acc.landm + d.landm, paintCost: acc.paintCost + d.paintCost, sundries: acc.sundries + d.sundries }
            },
            { hours: 0, landm: 0, paintCost: 0, sundries: 0 },
          )
        } catch { /* non-critical */ }

        const landm   = (totals?.landm ?? 0) + structTotals.landm
        const hrs     = (totals?.totalHours ?? 0) + structTotals.hours
        const matCost = (totals?.totalPaintCost ?? 0) + (totals?.sundries ?? 0) + structTotals.paintCost + structTotals.sundries

        // Build "Paints & Gallons" string from selected brand + calculated gallons
        const bp = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
        const bodyName   = paintProducts.find(p => p.id === bp.bodyId)?.name   ?? bp.bodyId
        const trimName   = paintProducts.find(p => p.id === bp.trimId)?.name   ?? bp.trimId
        const accentName = paintProducts.find(p => p.id === bp.accentId)?.name ?? bp.accentId
        const stainName  = paintProducts.find(p => p.id === bp.stainId)?.name  ?? bp.stainId
        const paintLines: string[] = []
        if ((totals?.body.gallons ?? 0) > 0)   paintLines.push(`Body: ${bodyName} - ${Math.ceil(totals!.body.gallons)} Gal`)
        if ((totals?.trim.gallons ?? 0) > 0)   paintLines.push(`Trim: ${trimName} - ${Math.ceil(totals!.trim.gallons)} Gal`)
        if ((totals?.accent.gallons ?? 0) > 0) paintLines.push(`Accent/Other: ${accentName} - ${Math.ceil(totals!.accent.gallons)} Gal`)
        if ((totals?.stain.gallons ?? 0) > 0)  paintLines.push(`Stain: ${stainName} - ${Math.ceil(totals!.stain.gallons)} Gal`)
        // Structure add-on gallons
        const structureAddons = [
          ...(estimate.deckAddons?.length ? estimate.deckAddons.map((a, i) => ({ label: estimate.deckAddons!.length > 1 ? `Deck ${i + 1}` : 'Deck', addon: a })) : estimate.deckAddon ? [{ label: 'Deck', addon: estimate.deckAddon }] : []),
          ...(estimate.pergolaAddon ? [{ label: 'Pergola', addon: estimate.pergolaAddon }] : []),
          ...(estimate.fenceAddon   ? [{ label: 'Fence',   addon: estimate.fenceAddon   }] : []),
          ...(estimate.shedAddon    ? [{ label: 'Shed',    addon: estimate.shedAddon    }] : []),
        ]
        for (const { label, addon } of structureAddons) {
          if (!addon.enabled) continue
          const gals = calcStructureAddonGallons(addon, appMap, constants, paintProducts)
          if (gals <= 0) continue
          const prodName = paintProducts.find(p => p.id === addon.paintProductId)?.name ?? addon.paintProductId
          paintLines.push(`${label}: ${prodName} - ${Math.ceil(gals)} Gal`)
        }

        await fetch('/api/work-orders/create', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            estimateId:      id,
            estimateType:    'exterior',
            clientName:      estimate.clientName,
            clientAddress:   estimate.clientAddress,
            clientEmail:     estimate.clientEmail,
            clientPhone:     estimate.clientPhone,
            clientContactId: estimate.clientContactId ?? '',
            scopeOfWork:     scopeParts.join('\n\n'),
            painterPay:      landm > 0 ? landm.toFixed(2) : '',
            totalHours:      hrs > 0 ? hrs.toFixed(2) : '',
            materialsPrice:  matCost > 0 ? matCost.toFixed(2) : '',
            projectTotal:    grandTotal > 0 ? grandTotal.toFixed(2) : '',
            fullPrice:       combinedSubtotal > 0 ? combinedSubtotal.toFixed(2) : '',
            discountAmount:  discountAmount > 0 ? discountAmount.toFixed(2) : '',
            paintsAndGallons: paintLines.join('\n'),
            jobType:         'Residential Exterior',
            jobNumber:       estimate.estimateNumber ? String(estimate.estimateNumber) : '',
            photoUrls:       estimate.photoUrls ?? [],
          }),
        })
      } catch {
        // Non-blocking — don't fail signing if work order creation fails
      }

      // 4. For manual estimates (no GHL contact), fire the accepted webhook
      if (isManualEstimate && capturedPdfUrl) {
        try {
          const brandPreset  = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
          const bodyProd     = paintProducts.find(p => p.id === brandPreset.bodyId)
          const trimProd     = paintProducts.find(p => p.id === brandPreset.trimId)
          const accentProd   = paintProducts.find(p => p.id === brandPreset.accentId)
          const stainProd    = paintProducts.find(p => p.id === brandPreset.stainId)
          const parsedAddr   = parseAddress(estimate.clientAddress ?? '')
          await fetch('https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/5590c13c-51a2-4ccf-9446-45f85557c79c', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // IDs GHL needs to call back with
              estimateId:     id,
              callbackUrl:    `${window.location.origin}/api/webhook/attach-contact`,
              // Client info
              clientName:     estimate.clientName,
              clientAddress1: parsedAddr.address1,
              clientCity:     parsedAddr.city,
              clientState:    parsedAddr.state,
              clientZip:      parsedAddr.zip,
              clientEmail:    estimate.clientEmail,
              clientPhone:    estimate.clientPhone,
              estimateType:   'exterior',
              estimateUrl:    `${window.location.origin}/p/${id}`,
              pdfUrl:         capturedPdfUrl,
              // Pricing (so GHL can pass them back for invoice creation)
              grandTotal:     Math.round(grandTotal * 100) / 100,
              depositAmount:  Math.round(depositAmount * 100) / 100,
              balanceDue:     Math.round(balanceDue * 100) / 100,
              depositPercent,
              taxRate:        taxRate ?? 0,
              taxCity:        parseCityFromAddress(estimate.clientAddress ?? ''),
              selectedBrand: brandPreset.label,
              productsSelected: {
                body:   bodyProd?.name   ?? '',
                trim:   trimProd?.name   ?? '',
                accent: accentProd?.name ?? '',
                stain:  stainProd?.name  ?? '',
              },
              photoUrls: estimate.photoUrls ?? [],
            }),
          })
        } catch {
          // Non-blocking — don't fail the sign flow
        }
      }

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

  // Resolve all scope fields for the active brand
  const brandScope = estimate.scopeByBrand?.[selectedBrand]
  const fallbackScope = getDefaultScopeForBrand(selectedBrand)
  const scopeProject       = brandScope?.scopeProject       ?? estimate.scopeProject       ?? ''
  const scopePrepWork      = brandScope?.scopePrepWork      ?? estimate.scopePrepWork       ?? ''
  const scopePainting      = brandScope?.scopePainting      ?? estimate.scopePainting       ?? ''
  const scopeCleanUp       = brandScope?.scopeCleanUp       ?? estimate.scopeCleanUp        ?? ''
  const scopeWalkThrough   = brandScope?.scopeWalkThrough   ?? estimate.scopeWalkThrough    ?? ''
  const scopePaintProducts = brandScope?.scopePaintProducts
    ?? estimate.scopePaintProductsByBrand?.[selectedBrand]
    ?? fallbackScope.scopePaintProducts
  const totalColors = brandScope?.totalColors ?? estimate.totalColors ?? ''
  const totalCoats  = brandScope?.totalCoats  ?? estimate.totalCoats  ?? ''

  const hasScope = scopePrepWork || scopePainting || scopeProject ||
                   scopeCleanUp  || scopeWalkThrough || scopePaintProducts

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Company header ─────────────────────────────────────────────── */}
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
                  className={`h-12 w-12 sm:h-14 sm:w-14 object-contain rounded-lg bg-white p-1.5 shrink-0 shadow-sm transition-opacity duration-300 ${
                    logoLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
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
          {/* Row 2: contact details */}
          <div className="mt-3 pt-3 border-t border-brand-600 space-y-0.5">
            <p className="text-brand-200 text-sm">{company.streetAddress} · {company.cityStateZip}</p>
            <p className="text-brand-200 text-sm">{company.phone} · {company.email}</p>
            {company.website && <p className="text-brand-200 text-sm">{company.website}</p>}
            {company.licenseNumber && <p className="text-brand-200 text-sm">License #: {company.licenseNumber}</p>}
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
              {scopeProject      && <ScopeBlock label="Project"        text={scopeProject} />}
              {scopePrepWork     && <ScopeBlock label="Prep Work"      text={scopePrepWork} />}
              {scopePainting     && <ScopeBlock label="Painting"       text={scopePainting} />}
              {scopeCleanUp      && <ScopeBlock label="Clean Up"       text={scopeCleanUp} />}
              {scopeWalkThrough  && <ScopeBlock label="Walk Through"   text={scopeWalkThrough} />}
              {scopePaintProducts && <ScopeBlock label="Paint Products" text={scopePaintProducts} />}
              {(totalColors || totalCoats) && (
                <div className="flex gap-6 pt-3 border-t border-gray-100">
                  {totalColors && (
                    <div>
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Colors: </span>
                      <span className="text-sm font-medium text-gray-700">{totalColors}</span>
                    </div>
                  )}
                  {totalCoats && (
                    <div>
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Coats: </span>
                      <span className="text-sm font-medium text-gray-700">{totalCoats}</span>
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
              {estimate.photoUrls!.map((url, idx) => {
                const note = (estimate as typeof estimate & { photoNotes?: string[] }).photoNotes?.[idx]
                return (
                  <div key={url} className="flex flex-col rounded-xl overflow-hidden border border-gray-100">
                    <button
                      onClick={() => setLightboxIndex(idx)}
                      className="aspect-square bg-gray-100 cursor-zoom-in group focus:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={note || `Photo ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </button>
                    {note && (
                      <p className="px-2 py-1.5 text-xs text-gray-600 bg-white border-t border-gray-100 leading-snug">{note}</p>
                    )}
                  </div>
                )
              })}
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
        {jobType !== 'structures' && <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {clientProvidingPaint ? (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-brand-50 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Paint Provided by Owner</h3>
                <p className="text-sm text-gray-500 mt-0.5">You are supplying the paint for this project, so no paint cost is included in the pricing below.</p>
              </div>
            </div>
          ) : (
          <>
          <h3 className="text-base font-bold text-gray-900 mb-1">Choose Your Paint</h3>
          <p className="text-sm text-gray-400 mb-4">
            {signed ? 'Paint selection locked — already signed.' : 'Select a paint tier to see how it affects your price.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {PAINT_BRANDS.map(brand => (
              <button
                key={brand.key}
                onClick={() => { if (!signed) setSelectedBrand(brand.key) }}
                disabled={signed && selectedBrand !== brand.key}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  selectedBrand === brand.key
                    ? 'bg-brand-600 text-white border-brand-600' + (signed ? ' ring-2 ring-brand-400' : '')
                    : signed
                      ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed opacity-50'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {brand.label}{signed && selectedBrand === brand.key ? ' ✓' : ''}
              </button>
            ))}
          </div>
          </>
          )}

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
                        className="w-6 h-6 rounded accent-brand-600 cursor-pointer"
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
                        checked={includedCustomIds.has(item.id)}
                        onChange={e => setIncludedCustomIds(prev => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(item.id)
                          else next.delete(item.id)
                          return next
                        })}
                        className="w-6 h-6 rounded accent-brand-600 cursor-pointer"
                      />
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{item.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums ml-4">+ {fmtD(item.price)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>}

        {/* ── Discount toggle ────────────────────────────────────────────── */}
        {(totals || hasStructures) && (
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
        {(totals || hasStructures) && (
          <div className="bg-white rounded-[18px] border border-[oklch(0.93_0.006_80)] shadow-[0_1px_2px_rgba(20,40,30,0.04),0_12px_32px_rgba(20,40,30,0.08)]">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[oklch(0.94_0.004_140)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[oklch(0.52_0.13_150)]">Your Estimate</p>
              <h2 className="mt-1.5 text-lg font-bold text-[oklch(0.3_0.012_250)]">{hideItemPrices ? 'Simple, all-in pricing.' : 'Everything’s itemized — no surprises.'}</h2>
            </div>

            <div className="px-6 pt-2 pb-6">

              {/* Line items */}
              <div>
                {jobType !== 'structures' && paintingSubtotal > 0 && (
                  <PriceLine label={clientProvidingPaint ? 'Exterior Painting — Labor (Paint by Owner)' : `Exterior Painting — ${PAINT_BRANDS.find(b => b.key === selectedBrand)?.label}`} value={hideItemPrices ? undefined : fmtD(paintingSubtotal)} />
                )}
                {jobType !== 'exterior' && deckSubtotal > 0 && (
                  <PriceLine label={`Deck${deckPaintLabel ? ` — ${deckPaintLabel}` : ''}`} value={hideItemPrices ? undefined : fmtD(deckSubtotal)} />
                )}
                {jobType !== 'exterior' && pergolaSubtotal > 0 && (
                  <PriceLine label={`Pergola${pergolaPaintLabel ? ` — ${pergolaPaintLabel}` : ''}`} value={hideItemPrices ? undefined : fmtD(pergolaSubtotal)} />
                )}
                {jobType !== 'exterior' && fenceSubtotal > 0 && (
                  <PriceLine label={`Fence${fencePaintLabel ? ` — ${fencePaintLabel}` : ''}`} value={hideItemPrices ? undefined : fmtD(fenceSubtotal)} />
                )}
                {jobType !== 'exterior' && shedSubtotal > 0 && (
                  <PriceLine label={`Shed${shedPaintLabel ? ` — ${shedPaintLabel}` : ''}`} value={hideItemPrices ? undefined : fmtD(shedSubtotal)} />
                )}
                {includeWood && woodTotal > 0 && <PriceLine label="Wood Replacement" value={hideItemPrices ? undefined : fmtD(woodTotal)} />}
                {(estimate.customItems ?? []).filter(i => includedCustomIds.has(i.id) && i.description && i.price > 0).map(item => (
                  <PriceLine key={item.id} label={item.description} value={hideItemPrices ? undefined : fmtD(item.price)} />
                ))}
              </div>

              {/* Subtotal / discount / tax */}
              <div className="border-t border-[oklch(0.94_0.004_140)] mt-1 pt-1">
                <PriceLine label="Subtotal" value={fmtD(combinedSubtotal)} />
                {applyDiscount && (
                  <div className="flex justify-between items-center gap-4 py-[9px]">
                    <span className="text-sm font-semibold text-[oklch(0.52_0.13_150)]">Discount (10% — Sign Today)</span>
                    <span className="text-sm font-semibold text-[oklch(0.52_0.13_150)] tabular-nums">− {fmtD(discountAmount)}</span>
                  </div>
                )}
                {taxRate != null && (
                  <div className="flex justify-between items-center gap-4 py-[9px]">
                    <span className="text-sm text-[oklch(0.5_0.01_250)]">
                      Sales Tax ({(taxRate * 100).toFixed(1)}%{parseCityFromAddress(estimate.clientAddress) ? ` — ${parseCityFromAddress(estimate.clientAddress)}` : ''})
                    </span>
                    <span className="text-sm text-[oklch(0.3_0.012_250)] tabular-nums">+ {fmtD(taxAmount)}</span>
                  </div>
                )}
              </div>

              {/* Project total */}
              <div className="border-t border-[oklch(0.94_0.004_140)] mt-1 pt-4 flex justify-between items-center gap-4">
                <span className="font-bold text-[oklch(0.3_0.012_250)]">Project total</span>
                <span className="text-[22px] font-bold text-[oklch(0.3_0.012_250)] tabular-nums">{fmtD(grandTotal)}</span>
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

        {/* ── Terms & Conditions ─────────────────────────────────────────── */}
        <TermsAndConditions companyName={company.name} warrantyYears={jobType !== 'structures' && ['duration','emerald','emeraldRR'].includes(selectedBrand) ? 5 : 3} />

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

              {/* PDF status */}
              <div className="mt-4">
                {pdfStatus === 'uploading' && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                    Generating PDF…
                  </div>
                )}
                {pdfStatus === 'done' && (
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm text-green-600 font-medium">
                      ✓ PDF {savedToDrive ? 'saved to Google Drive' : 'saved to cloud backup'}
                    </p>
                    {pdfLink && (
                      <a href={pdfLink} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-600 underline hover:text-brand-800">
                        {savedToDrive ? 'Open in Drive' : 'Download backup'}
                      </a>
                    )}
                  </div>
                )}
                {pdfStatus === 'error' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-left">
                    <p className="text-sm font-semibold text-yellow-800">Drive upload failed — backup saved</p>
                    <p className="text-xs text-yellow-600 mt-1">PDF was downloaded to your device and saved as a backup.</p>
                    {pdfLink && (
                      <a href={pdfLink} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-600 underline mt-1 block">
                        Download backup
                      </a>
                    )}
                    {pdfError && <p className="text-xs text-yellow-500 mt-2 font-mono break-all">{pdfError}</p>}
                  </div>
                )}

                {/* Invoice status */}
                {invoiceStatus === 'creating' && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mt-3">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                    Sending invoice…
                  </div>
                )}

                {invoiceStatus === 'done' && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    {/* "Invoice Sent" banner */}
                    <div className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                      </svg>
                      Invoice Sent
                    </div>
                    <p className="text-xs text-gray-400">Your deposit invoice has been sent. Check your email.</p>
                    {depositInvoiceUrl && (
                      <a
                        href={depositInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                        </svg>
                        Pay Deposit Now
                      </a>
                    )}
                  </div>
                )}

                {/* Signed but invoice not yet processed — actively polling */}
                {invoiceStatus === 'idle' && justSigned && (
                  <div className="mt-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div className="shrink-0">
                      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-amber-800">Preparing your invoice…</p>
                      <p className="text-xs text-amber-600 mt-0.5">This usually takes less than a minute. Your deposit invoice will be sent to your email automatically.</p>
                    </div>
                  </div>
                )}

                {invoiceStatus === 'error' && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-left">
                    <p className="text-sm font-semibold text-yellow-800">Invoice could not be sent automatically</p>
                    <p className="text-xs text-yellow-600 mt-0.5">Our team will follow up with your deposit invoice shortly.</p>
                    {invoiceError && <p className="text-xs text-yellow-500 mt-1 font-mono break-all">{invoiceError}</p>}
                  </div>
                )}

                {/* Admin-only: create GHL invoices retroactively for estimates that missed them */}
                {user && estimate?.clientContactId && invoiceStatus === 'idle' && grandTotal > 0 && (
                  <div className="mt-6 pt-5 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-3 text-center">Admin — GHL invoices were not created at signing</p>
                    {retryInvoice ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                        Creating invoices…
                      </div>
                    ) : retryInvoiceError ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left">
                        <p className="text-sm font-semibold text-red-700">Failed: {retryInvoiceError}</p>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          setRetryInvoice(true)
                          setRetryInvoiceError(null)
                          try {
                            const brandPreset = PAINT_BRANDS.find(b => b.key === selectedBrand) ?? PAINT_BRANDS[0]
                            const itemLabel   = `Exterior Painting — ${brandPreset.label}`
                            const res = await fetch('/api/accept-estimate', {
                              method:  'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body:    JSON.stringify({
                                estimateId:     id,
                                estimateType:   'exterior',
                                signatureName:  estimate.signatureName ?? '',
                                contactId:      estimate.clientContactId,
                                contactName:    estimate.clientName,
                                contactEmail:   estimate.clientEmail,
                                contactPhone:   estimate.clientPhone,
                                depositAmount,
                                balanceDue,
                                depositPercent,
                                grandTotal,
                                itemLabel,
                                taxRate:        taxRate ?? null,
                                taxCity:        parseCityFromAddress(estimate.clientAddress ?? ''),
                                company: {
                                  name:          company.name,
                                  phone:         company.phone,
                                  email:         company.email,
                                  website:       company.website,
                                  streetAddress: company.streetAddress,
                                  cityStateZip:  company.cityStateZip,
                                },
                              }),
                            })
                            const json = await res.json() as { depositInvoiceUrl?: string; invoiceError?: string }
                            if (json.invoiceError) throw new Error(json.invoiceError)
                            if (json.depositInvoiceUrl) setDepositInvoiceUrl(json.depositInvoiceUrl)
                            setInvoiceStatus('done')
                          } catch (err) {
                            setRetryInvoiceError(err instanceof Error ? err.message : 'Failed')
                          } finally {
                            setRetryInvoice(false)
                          }
                        }}
                        className="w-full py-2.5 rounded-xl border border-brand-300 text-brand-700 text-sm font-semibold hover:bg-brand-50 transition-colors"
                      >
                        Create GHL Invoices Now
                      </button>
                    )}
                  </div>
                )}
              {/* Change Order summary — shown to everyone when a change order exists */}
              {(coResult || (isModified && existingChangeOrders.length > 0)) && (() => {
                const items   = coResult ? coItems : existingChangeOrders
                const coTotal = items.reduce((s, i) => s + (i.price || 0), 0)
                const signedTotal   = (estimate as typeof estimate & { signedGrandTotal?: number })?.signedGrandTotal ?? grandTotal
                const signedDeposit = (estimate as typeof estimate & { signedDepositAmount?: number })?.signedDepositAmount ?? depositAmount
                    const newTotal  = coResult?.newGrandTotal  ?? (signedTotal + coTotal)
                    const newBal    = coResult?.newBalanceDue  ?? (newTotal - signedDeposit)
                    return (
                      <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Modified</span>
                          <p className="text-sm font-bold text-amber-800">Change Order Applied</p>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between text-gray-600">
                            <span>Original Contract Total</span>
                            <span className="tabular-nums">{fmtD(signedTotal)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Deposit Paid</span>
                            <span className="tabular-nums text-green-600">− {fmtD(signedDeposit)}</span>
                          </div>
                          {items.map(item => (
                            <div key={item.id} className="flex justify-between text-amber-700">
                              <span>{item.description}</span>
                              <span className={`tabular-nums ${item.price >= 0 ? 'text-amber-700' : 'text-green-700'}`}>{item.price >= 0 ? '+ ' : '− '}{fmtD(Math.abs(item.price))}</span>
                            </div>
                          ))}
                          <div className="border-t border-amber-200 pt-2 flex justify-between font-bold text-gray-900">
                            <span>New Total Due</span>
                            <span className="tabular-nums">{fmtD(newBal)}</span>
                          </div>
                        </div>
                      </div>
                    )
              })()}
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-900 mb-1">Accept This Estimate</h3>
              <p className="text-sm text-gray-400 mb-5">
                By signing below you authorize {company.name} to proceed with the work described
                above at the price shown.
              </p>

              {/* Warning when manual estimate is missing required client info */}
              {isManualEstimate && missingFields.length > 0 && (
                <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-yellow-800 mb-1">Missing contact information</p>
                  <p className="text-sm text-yellow-700">
                    This estimate is missing: <span className="font-medium">{missingFields.join(', ')}</span>.
                    Please contact {company.name} to have your information added before signing.
                  </p>
                </div>
              )}
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
                  disabled={!agreed || !sigName.trim() || !sigDataUrl || signing || !canInteract}
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

            {/* Warning for manual estimates missing info */}
            {isManualEstimate && missingFields.length > 0 && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-left">
                <p className="text-sm font-semibold text-yellow-800 mb-1">Cannot send — missing information</p>
                <p className="text-sm text-yellow-700">
                  Missing: <span className="font-medium">{missingFields.join(', ')}</span>. Please contact {company.name}.
                </p>
              </div>
            )}

            {sendDone ? (
              <p className="text-sm font-semibold text-green-600">✓ Estimate sent! Check your email.</p>
            ) : (
              <>
                <button
                  onClick={async () => {
                    if (!estimate || sending || !canInteract) return
                    setSending(true)
                    setSendError(null)
                    try {
                      const estimateUrl = `${window.location.origin}/p/${id}`
                      const res = await fetch('/api/send-estimate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clientName:      estimate.clientName,
                          clientAddress:   estimate.clientAddress,
                          clientPhone:     estimate.clientPhone,
                          clientEmail:     estimate.clientEmail,
                          clientContactId: estimate.clientContactId ?? '',
                          clientFolderId:  estimate.clientFolderId  ?? '',
                          estimateUrl,
                          estimateId:      id,
                          estimateType:    'exterior',
                          subtotal:        Math.round(combinedSubtotal * 100) / 100,
                          discountAmount:  Math.round(combinedSubtotal * 0.10 * 100) / 100,
                          grandTotal:      Math.round((combinedSubtotal * 0.90 + taxAmount) * 100) / 100,
                          taxRate:         taxRate ?? 0,
                          taxAmount:       Math.round(taxAmount * 100) / 100,
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
                  disabled={sending || !canInteract}
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
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const DEFAULT_TERMS = `WARRANTY

• Vanhousing Painters LLC gives workmanship warranty for a period of 3 years from date of significant completion of the project. If paint failure appears, we will supply labor and materials to correct the condition without cost. This warranty is in lieu of all other warranties, expressed or implied. Our responsibility is limited to correcting the condition as indicated above.

• This warranty excludes, and in no event will Vanhousing Painters LLC be responsible for consequential or incidental damage caused by accident or abuse, temperature or humidity changes, settlement, or moisture — i.e., cracks caused by moving parts as siding hardieplanks, expansion and/or contraction.

INSURANCE

• Vanhousing Painters LLC carries full liability and auto insurance.

• Certificate of insurance available upon request.

STANDARDS

• All work is to be completed in a workmanlike manner according to standard practices. It is essential that the work area be available to us free from other trades in the immediate working area. Workers will remain on the job until completion of project, weather permitting. All agreements contingent upon strikes, accidents, or delays beyond our control.

• All work will be done as per standards of the PCA (Painting Contractors of America).

• The painting contractor will produce a "properly painted surface." A properly painted surface is uniform in color and sheen, free of foreign material, lumps, skins, sags, holidays, misses, strike-through, or insufficient coverage. It is a surface free of drips, spatters, spills, or overspray caused by the contractor's workforce. Compliance shall be determined when viewed without magnification at a distance of five feet or more under normal lighting conditions.

• All materials will be applied in accordance with the manufacturer's recommendations.

GENERAL CONDITIONS

• If after you agree to this work you desire any changes or additional work, such changes must be agreed upon in writing before work is performed. Workers are instructed not to undertake additional work without authorization.

• Any interruptions that require re-mobilization of workers and/or equipment may result in additional costs.

• It is essential that the work area be available to us free from other trades. Trade interference may result in additional charges.

• Price is valid for 90 days, unless otherwise noted.

• Job starting date will happen sooner if we finish existing projects earlier.

The following are to be provided by the customer:
• Power  • Water  • Parking  • Wash-out area

CHANGE ORDERS

• Any change orders, additions, or descopes must be agreed upon in writing and signed by both parties before proceeding. All change orders are billed extra.

PAYMENT TERMS

• We require a 20% deposit upfront to secure your project start date.

• Change orders will be billed and due at the next billing cycle.

• The project will be billed in full and due upon completion of the scope.`

function TermsAndConditions({ companyName: _, warrantyYears = 3 }: { companyName: string; warrantyYears?: number }) {
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
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="mt-4 text-xs text-gray-600 whitespace-pre-line leading-relaxed space-y-1">
            {DEFAULT_TERMS.replace('3 years', `${warrantyYears} years`)}
          </div>
          <a
            href="https://www.pcapainted.org/resource-center/painting-standards/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-4 text-xs text-brand-600 hover:text-brand-800 font-medium"
          >
            View PCA Painting Standards (PDF) →
          </a>
        </div>
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
