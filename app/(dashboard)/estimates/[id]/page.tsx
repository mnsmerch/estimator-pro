'use client'

import { useState, useEffect, useRef, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { updateEstimate, deleteEstimate } from '@/lib/firebase/estimates'
import { buildApplicationList } from '@/lib/applicationList'
import { calcEstimate, calcMarkup, calcStructureAddonSubtotal, calcStructureAddonGallons, calcStructureAddonDetails } from '@/lib/estimateEngine'
import {
  DEFAULT_BUSINESS_RULES, DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_PAINT_PRODUCTS, DEFAULT_RATES, DEFAULT_COMPANY,
} from '@/lib/defaultSettings'
import type { EstimateData, EstimateStatus } from '@/types/estimate'
import type { BusinessRules, ProductionConstants, PaintProduct, ProductionRates, CompanySettings } from '@/types/settings'

const PAINT_BRANDS = [
  { key: 'superPaint', label: 'Super Paint',          bodyId: 'sw-super-paint-flat', trimId: 'sw-super-paint-satin', accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'duration',   label: 'Duration',             bodyId: 'sw-duration-flat',    trimId: 'sw-duration-satin',   accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'emerald',    label: 'Emerald',              bodyId: 'sw-emerald-flat',     trimId: 'sw-emerald-satin',    accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
  { key: 'emeraldRR',  label: 'Emerald Rain Refresh', bodyId: 'sw-emerald-rr-flat',  trimId: 'sw-emerald-rr-satin', accentId: 'sw-super-paint-flat', stainId: 'sw-super-deck-stain' },
]
const emptyPaint: PaintProduct = { id: '', name: '', singleGallon: 0, fiveGallon: 0, coverage: 400 }

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

const STATUS_OPTIONS: { value: EstimateStatus; label: string }[] = [
  { value: 'draft',    label: 'Draft'    },
  { value: 'pending',  label: 'Pending'  },
  { value: 'approved', label: 'Signed'   },
  { value: 'declined', label: 'Declined' },
]

function statusLabel(s: string) {
  if (s === 'approved') return 'Signed'
  if (s === 'declined' || s === 'rejected') return 'Declined'
  if (s === 'sent' || s === 'pending') return 'Pending'
  return 'Draft'
}
function statusColor(s: string) {
  if (s === 'approved') return 'bg-green-50 text-green-700 ring-1 ring-green-200'
  if (s === 'declined' || s === 'rejected') return 'bg-red-50 text-red-600 ring-1 ring-red-200'
  if (s === 'sent' || s === 'pending') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  return 'bg-gray-100 text-gray-700'
}

export default function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = use(params)
  const router   = useRouter()
  const { user } = useAuth()

  const [estimate,      setEstimate]      = useState<EstimateData | null>(null)
  const [rules,         setRules]         = useState<BusinessRules>(DEFAULT_BUSINESS_RULES)
  const [constants,     setConstants]     = useState<ProductionConstants>(DEFAULT_PRODUCTION_CONSTANTS)
  const [paintProducts, setPaintProducts] = useState<PaintProduct[]>(DEFAULT_PAINT_PRODUCTS)
  const [rates,         setRates]         = useState<ProductionRates>(DEFAULT_RATES)
  const [company,       setCompany]       = useState<CompanySettings>(DEFAULT_COMPANY)
  const [loading,       setLoading]       = useState(true)

  const [statusOpen,        setStatusOpen]        = useState(false)
  const [moreOpen,          setMoreOpen]          = useState(false)
  const [updatingStatus,    setUpdatingStatus]    = useState(false)
  const [deleting,          setDeleting]          = useState(false)
  const [converting,        setConverting]        = useState(false)
  const [sendingEmail,      setSendingEmail]      = useState(false)
  const [emailDone,         setEmailDone]         = useState(false)
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false)
  const [workOrderDone,     setWorkOrderDone]     = useState(false)

  // Tax correction (admin tool for signed estimates missing sales tax)
  const [showTaxCorrection, setShowTaxCorrection] = useState(false)
  const [corrZip,           setCorrZip]           = useState('')
  const [corrBrand,         setCorrBrand]         = useState('')
  const [corrDepositPaid,   setCorrDepositPaid]   = useState('')
  const [corrPreTaxTotal,   setCorrPreTaxTotal]   = useState('')
  const [corrTaxRate,       setCorrTaxRate]       = useState<number | null>(null)
  const [corrTaxCity,       setCorrTaxCity]       = useState('')
  const [corrFetching,      setCorrFetching]      = useState(false)
  const [corrSaving,        setCorrSaving]        = useState(false)
  const [corrError,         setCorrError]         = useState<string | null>(null)
  const [corrResult,        setCorrResult]        = useState<{ newGrandTotal: number; remainingBalance: number; invoiceUrl: string | null } | null>(null)

  async function fetchCorrectionTaxRate() {
    if (!corrZip.trim()) return
    setCorrFetching(true); setCorrError(null); setCorrTaxRate(null)
    try {
      const zip  = corrZip.trim()
      const city = (estimate?.clientAddress ?? '').split(',')[1]?.trim().replace(/\s+[A-Z]{2}\s*$/, '').trim() ?? ''
      const res  = await fetch('/api/tax-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip, city }),
      })
      const json = await res.json() as { rate?: number; error?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Not found')
      setCorrTaxRate(json.rate!)
      setCorrTaxCity(city)
    } catch (err) {
      setCorrError(err instanceof Error ? err.message : 'Tax lookup failed')
    } finally { setCorrFetching(false) }
  }

  async function handleSaveTaxCorrection(sendToClient: boolean) {
    if (!estimate || corrSaving || corrTaxRate === null) return
    const preTax  = parseFloat(corrPreTaxTotal)
    const deposit = parseFloat(corrDepositPaid)
    if (isNaN(preTax) || isNaN(deposit)) { setCorrError('Enter valid amounts'); return }
    setCorrSaving(true); setCorrError(null)
    try {
      const res  = await fetch('/api/admin/correct-tax-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimateId:         id,
          selectedBrand:      corrBrand || (estimate.selectedBrand ?? 'superPaint'),
          preTaxTotal:        preTax,
          taxRate:            corrTaxRate,
          taxCity:            corrTaxCity,
          depositAlreadyPaid: deposit,
          sendToClient,
          contactId:          estimate.clientContactId ?? '',
          contactName:        estimate.clientName,
          contactEmail:       estimate.clientEmail,
          contactPhone:       estimate.clientPhone,
          estimateNumber:     estimate.estimateNumber ?? null,
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
      const json = await res.json() as { newGrandTotal?: number; remainingBalance?: number; invoiceUrl?: string | null; error?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed')
      setCorrResult({ newGrandTotal: json.newGrandTotal!, remainingBalance: json.remainingBalance!, invoiceUrl: json.invoiceUrl ?? null })
      setShowTaxCorrection(false)
      setEstimate(prev => prev ? { ...prev, salesTaxRate: corrTaxRate, selectedBrand: corrBrand || (prev.selectedBrand ?? 'superPaint') } : prev)
    } catch (err) {
      setCorrError(err instanceof Error ? err.message : 'Failed')
    } finally { setCorrSaving(false) }
  }

  // Change order
  const [showChangeOrder, setShowChangeOrder] = useState(false)
  const [coItems,         setCoItems]         = useState<{ id: string; description: string; price: number }[]>([])
  const [coNotes,         setCoNotes]         = useState('')
  const [coSaving,        setCoSaving]        = useState(false)
  const [coError,         setCoError]         = useState<string | null>(null)
  const [coResult,        setCoResult]        = useState<{ newGrandTotal: number; newBalanceDue: number; changeOrderTotal: number } | null>(null)

  function addCoItem() { setCoItems(p => [...p, { id: crypto.randomUUID(), description: '', price: 0 }]) }
  function updateCoItem(id: string, f: 'description'|'price', v: string|number) { setCoItems(p => p.map(i => i.id===id?{...i,[f]:v}:i)) }
  function removeCoItem(id: string) { setCoItems(p => p.filter(i => i.id !== id)) }

  async function handleSaveChangeOrder() {
    if (!coItems.length || coSaving) return
    setCoSaving(true); setCoError(null)
    try {
      const res  = await fetch('/api/change-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId: id, items: coItems, notes: coNotes }),
      })
      const json = await res.json() as { success?: boolean; error?: string; changeOrderTotal?: number; newGrandTotal?: number; newBalanceDue?: number; ghlUpdateResult?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed')
      setCoResult({ newGrandTotal: json.newGrandTotal!, newBalanceDue: json.newBalanceDue!, changeOrderTotal: json.changeOrderTotal! })
      setShowChangeOrder(false)
      setEstimate(prev => prev ? { ...prev, isModified: true, changeOrders: coItems } as typeof prev : prev)
    } catch (err) {
      setCoError(err instanceof Error ? err.message : 'Failed')
    } finally { setCoSaving(false) }
  }

  const statusRef        = useRef<HTMLDivElement>(null)
  const moreRef          = useRef<HTMLDivElement>(null)
  const cachedTotalSaved = useRef(false)

  // Load via proposal API which returns estimate + all settings together
  useEffect(() => {
    fetch(`/api/proposal/${id}`)
      .then(r => r.json())
      .then((d: {
        estimate: EstimateData
        rules: BusinessRules
        constants: ProductionConstants
        paintProducts: PaintProduct[]
        rates: ProductionRates
        company: CompanySettings
      }) => {
        setEstimate(d.estimate)
        if (d.rules)         setRules(d.rules)
        if (d.constants)     setConstants(d.constants)
        if (d.paintProducts) setPaintProducts(d.paintProducts)
        if (d.rates)         setRates(d.rates)
        if (d.company)       setCompany(d.company)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
      if (moreRef.current   && !moreRef.current.contains(e.target as Node))   setMoreOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Calculate pricing (same logic as proposal page)
  const applications = useMemo(() => buildApplicationList(rates), [rates])
  const appMap       = useMemo(() => new Map(applications.map(a => [a.uniqueKey, a])), [applications])

  const clientProvidingPaint = (estimate?.selectedBodyPaint === 'no-paint')

  const totals = useMemo(() => {
    if (!estimate?.rows?.length) return null
    const brand      = PAINT_BRANDS.find(b => b.key === (estimate.selectedBrand ?? 'superPaint')) ?? PAINT_BRANDS[0]
    const cpp        = estimate.selectedBodyPaint === 'no-paint'
    const bodyId     = cpp ? (estimate.selectedBodyPaint   ?? brand.bodyId)   : brand.bodyId
    const trimId     = cpp ? (estimate.selectedTrimPaint   ?? brand.trimId)   : brand.trimId
    const accentId   = cpp ? (estimate.selectedAccentPaint ?? brand.accentId) : brand.accentId
    const stainId    = cpp ? (estimate.selectedStainPaint  ?? brand.stainId)  : brand.stainId
    const bodyPaint   = paintProducts.find(p => p.id === bodyId)   ?? emptyPaint
    const trimPaint   = paintProducts.find(p => p.id === trimId)   ?? emptyPaint
    const accentPaint = paintProducts.find(p => p.id === accentId) ?? emptyPaint
    const stainPaint  = paintProducts.find(p => p.id === stainId)  ?? emptyPaint
    const validRows   = estimate.rows.filter(r => r.applicationKey !== '')
    if (!validRows.length) return null
    return calcEstimate(validRows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint)
  }, [estimate, paintProducts, appMap, rules, constants])

  const markup = useMemo(() => calcMarkup(rules), [rules])

  const deckSubtotal = useMemo(() => {
    const addons = estimate?.deckAddons?.length
      ? estimate.deckAddons
      : estimate?.deckAddon ? [estimate.deckAddon] : []
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

  const woodTotalRaw = useMemo(() => {
    if (markup <= 0 || !estimate?.woodReplacementRows?.length) return 0
    return estimate.woodReplacementRows.reduce((sum, row) => {
      if (!row.itemKey) return sum
      const rate = (rates.woodReplacement as Record<string, number>)[row.itemKey] ?? 0
      const total = row.front + row.right + row.back + row.left
      return sum + (total * rate / markup)
    }, 0)
  }, [estimate, rates, markup])

  const customTotalRaw = useMemo(() => {
    if (!estimate?.customItems?.length) return 0
    return estimate.customItems.reduce((sum, item) => {
      if (!item.description && !item.price) return sum
      return sum + (item.price || 0)
    }, 0)
  }, [estimate])

  const structDetailsTotals = useMemo(() => {
    const addons = [
      ...(estimate?.deckAddons?.length ? estimate.deckAddons.map(a => ({ addon: a, setup: 1/20 })) : estimate?.deckAddon ? [{ addon: estimate.deckAddon, setup: 1/20 }] : []),
      ...(estimate?.pergolaAddon ? [{ addon: estimate.pergolaAddon, setup: 0 }] : []),
      ...(estimate?.fenceAddon   ? [{ addon: estimate.fenceAddon,   setup: 0 }] : []),
      ...(estimate?.shedAddon    ? [{ addon: estimate.shedAddon,    setup: 0 }] : []),
    ]
    return addons.reduce(
      (acc, { addon, setup }) => {
        const d = calcStructureAddonDetails(addon, setup, appMap, rules, constants, paintProducts)
        return { hours: acc.hours + d.hours, landm: acc.landm + d.landm, paintCost: acc.paintCost + d.paintCost, sundries: acc.sundries + d.sundries }
      },
      { hours: 0, landm: 0, paintCost: 0, sundries: 0 },
    )
  }, [estimate, appMap, rules, constants, paintProducts])

  const jobType         = estimate?.jobType ?? 'exterior'
  const taxRate         = estimate?.salesTaxRate ?? null
  const salesDiscount   = rules.salesDiscount ?? 0.10
  const woodTotal       = (estimate?.woodReplacementOpen ?? false) ? woodTotalRaw : 0
  const customTotal     = (estimate?.customItemsOpen ?? false) ? customTotalRaw : 0
  const paintingSubtotal = jobType !== 'structures' ? (totals?.subtotal ?? 0) : 0
  const structTotal     = jobType !== 'exterior' ? (deckSubtotal + pergolaSubtotal + fenceSubtotal + shedSubtotal) : 0
  const combinedSubtotal = paintingSubtotal + structTotal + woodTotal + customTotal
  const discountAmount  = combinedSubtotal * salesDiscount
  const discounted      = combinedSubtotal - discountAmount
  const taxAmount       = taxRate != null ? discounted * taxRate : 0
  const grandTotal      = discounted + taxAmount
  const depositPercent  = rules.depositPercent ?? 0.20
  const depositAmount   = grandTotal * depositPercent
  const balanceDue      = grandTotal - depositAmount

  // Cache computed total for list view — fire once after load settles
  useEffect(() => {
    if (!loading && grandTotal > 0 && !cachedTotalSaved.current) {
      cachedTotalSaved.current = true
      updateEstimate(id, { cachedGrandTotal: grandTotal }).catch(() => {})
    }
  }, [loading, grandTotal, id])

  const fencePaintLabel = estimate?.fenceAddon?.enabled
    ? (paintProducts.find(p => p.id === estimate.fenceAddon!.paintProductId)?.name ?? null) : null
  const shedPaintLabel  = estimate?.shedAddon?.enabled
    ? (paintProducts.find(p => p.id === estimate.shedAddon!.paintProductId)?.name ?? null) : null
  const deckPaintLabel  = (() => {
    const addons = estimate?.deckAddons?.length ? estimate.deckAddons : estimate?.deckAddon ? [estimate.deckAddon] : []
    const ids = [...new Set(addons.filter(a => a.enabled).map(a => a.paintProductId))]
    return ids.length === 1 ? (paintProducts.find(p => p.id === ids[0])?.name ?? null) : null
  })()

  async function handleStatusChange(newStatus: EstimateStatus) {
    if (!estimate) return
    setStatusOpen(false)
    setUpdatingStatus(true)
    try {
      await updateEstimate(id, { status: newStatus })
      setEstimate(prev => prev ? { ...prev, status: newStatus } : prev)
    } finally { setUpdatingStatus(false) }
  }

  async function handleCreateWorkOrder() {
    if (!estimate || creatingWorkOrder) return
    setMoreOpen(false)
    setCreatingWorkOrder(true)
    try {
      const scopeParts = [
        estimate.scopeProject, estimate.scopePrepWork, estimate.scopePainting,
        estimate.scopeCleanUp, estimate.scopeWalkThrough,
      ].filter(Boolean)

      // Build paints & gallons string
      const brand = PAINT_BRANDS.find(b => b.key === (estimate.selectedBrand ?? 'superPaint')) ?? PAINT_BRANDS[0]
      const paintLines: string[] = []
      if (totals && totals.body.gallons > 0) {
        const name = paintProducts.find(p => p.id === brand.bodyId)?.name ?? brand.bodyId
        paintLines.push(`Body: ${name} - ${Math.ceil(totals.body.gallons)} Gal`)
      }
      if (totals && totals.trim.gallons > 0) {
        const name = paintProducts.find(p => p.id === brand.trimId)?.name ?? brand.trimId
        paintLines.push(`Trim: ${name} - ${Math.ceil(totals.trim.gallons)} Gal`)
      }
      if (totals && totals.accent.gallons > 0) {
        const name = paintProducts.find(p => p.id === brand.accentId)?.name ?? brand.accentId
        paintLines.push(`Accent/Other: ${name} - ${Math.ceil(totals.accent.gallons)} Gal`)
      }
      if (totals && totals.stain.gallons > 0) {
        const name = paintProducts.find(p => p.id === brand.stainId)?.name ?? brand.stainId
        paintLines.push(`Solid Stain: ${name} - ${Math.ceil(totals.stain.gallons)} Gal`)
      }
      // Structure add-on gallons
      const structureAddons: { label: string; addon: typeof estimate.fenceAddon }[] = [
        ...(estimate.deckAddons?.length ? estimate.deckAddons.map((a, i) => ({ label: estimate.deckAddons!.length > 1 ? `Deck ${i + 1}` : 'Deck', addon: a })) : estimate.deckAddon ? [{ label: 'Deck', addon: estimate.deckAddon }] : []),
        ...(estimate.pergolaAddon ? [{ label: 'Pergola', addon: estimate.pergolaAddon }] : []),
        ...(estimate.fenceAddon   ? [{ label: 'Fence',   addon: estimate.fenceAddon   }] : []),
        ...(estimate.shedAddon    ? [{ label: 'Shed',    addon: estimate.shedAddon    }] : []),
      ]
      for (const { label, addon } of structureAddons) {
        if (!addon?.enabled) continue
        const gals = calcStructureAddonGallons(addon, appMap, constants, paintProducts)
        if (gals <= 0) continue
        const prodName = paintProducts.find(p => p.id === addon.paintProductId)?.name ?? addon.paintProductId
        paintLines.push(`${label}: ${prodName} - ${Math.ceil(gals)} Gal`)
      }

      // Sum structure add-on labor/materials so work order totals are complete
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
      } catch { /* non-critical — fall back to exterior-only totals */ }
      const totalLandm      = (totals?.landm ?? 0) + structTotals.landm
      const totalHoursAll   = (totals?.totalHours ?? 0) + structTotals.hours
      const totalMatCost    = (totals?.totalPaintCost ?? 0) + (totals?.sundries ?? 0) + structTotals.paintCost + structTotals.sundries

      const res = await fetch('/api/work-orders/create', {
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
          jobType:         'Residential Exterior',
          jobNumber:       estimate.estimateNumber ? String(estimate.estimateNumber) : '',
          painterPay:      totalLandm > 0 ? totalLandm.toFixed(2) : '',
          totalHours:      totalHoursAll > 0 ? totalHoursAll.toFixed(2) : '',
          materialsPrice:  totalMatCost > 0 ? totalMatCost.toFixed(2) : '',
          projectTotal:    grandTotal > 0 ? grandTotal.toFixed(2) : '',
          fullPrice:       combinedSubtotal > 0 ? combinedSubtotal.toFixed(2) : '',
          discountAmount:  discountAmount > 0 ? discountAmount.toFixed(2) : '',
          paintsAndGallons: paintLines.join('\n'),
          photoUrls:       estimate.photoUrls ?? [],
        }),
      })
      const json = await res.json() as { workOrderId?: string; error?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed')
      setWorkOrderDone(true)
      setTimeout(() => router.push('/work-orders'), 800)
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setCreatingWorkOrder(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete estimate for "${estimate?.clientName || 'Unnamed Client'}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteEstimate(id)
      router.replace('/estimates')
    } catch { alert('Delete failed.'); setDeleting(false) }
  }

  async function handleConvert(toType: 'interior' | 'cabinet') {
    if (!user || converting) return
    setMoreOpen(false)
    if (!confirm(`Convert this exterior estimate to ${toType}? Client info & photos carry over; the exterior draft will be replaced.`)) return
    setConverting(true)
    try {
      const token = await user.getIdToken()
      const res   = await fetch('/api/convert-estimate-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estimateId: id, fromType: 'exterior', toType }),
      })
      const json = await res.json() as { editUrl?: string; error?: string }
      if (!res.ok || !json.editUrl) throw new Error(json.error ?? 'Failed')
      router.push(json.editUrl)
    } catch (err) {
      alert(`Convert failed: ${err instanceof Error ? err.message : String(err)}`)
      setConverting(false)
    }
  }

  async function handleEmail() {
    if (!estimate || sendingEmail) return
    setSendingEmail(true)
    try {
      await fetch('/api/send-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName:      estimate.clientName,
          clientAddress:   estimate.clientAddress,
          clientPhone:     estimate.clientPhone,
          clientEmail:     estimate.clientEmail,
          clientContactId: estimate.clientContactId ?? '',
          clientFolderId:  estimate.clientFolderId  ?? '',
          estimateUrl:     `${window.location.origin}/p/${id}`,
          estimateId:      id,
          estimateType:    'exterior',
          grandTotal,
        }),
      })
      setEmailDone(true)
      setTimeout(() => setEmailDone(false), 3000)
    } finally { setSendingEmail(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!estimate) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <p className="text-gray-500">Estimate not found.</p>
      <a href="/estimates" className="text-sm text-brand-600 hover:text-brand-800">← Back to Estimates</a>
    </div>
  )

  const currentStatus = estimate.status ?? 'draft'
  const proposalUrl   = `/p/${id}`
  const selectedBrandLabel = clientProvidingPaint ? 'Labor (Paint by Owner)' : (PAINT_BRANDS.find(b => b.key === (estimate.selectedBrand ?? 'superPaint'))?.label ?? 'Super Paint')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Action bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-2 flex-wrap">
          <a href="/estimates" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mr-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            <span className="hidden sm:inline">Estimates</span>
          </a>

          <h1 className="text-sm font-bold text-gray-900 mr-auto">
            {estimate.estimateNumber ? `Estimate #${estimate.estimateNumber}` : estimate.clientName || 'Estimate'}
          </h1>

          <a href={`/estimates/${id}/edit`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            Edit
          </a>

          <button onClick={handleEmail} disabled={sendingEmail} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${emailDone ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            {emailDone ? 'Sent!' : sendingEmail ? 'Sending…' : 'Email'}
          </button>

          <div className="relative" ref={statusRef}>
            <button onClick={() => setStatusOpen(v => !v)} disabled={updatingStatus} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${statusColor(currentStatus)}`}>
              {updatingStatus ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : statusLabel(currentStatus)}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {statusOpen && (
              <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
                {STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => handleStatusChange(opt.value)} className={`w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors ${currentStatus === opt.value ? 'text-brand-700 bg-brand-50' : 'text-gray-700'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <a href={proposalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            <span className="hidden sm:inline">View Proposal</span>
          </a>

          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(v => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              More
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
                <button onClick={handleCreateWorkOrder} disabled={creatingWorkOrder || workOrderDone} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  {creatingWorkOrder ? 'Creating…' : workOrderDone ? '✓ Work Order Created' : 'Create Work Order'}
                </button>
                {estimate?.status === 'approved' && (
                  <button onClick={() => { setMoreOpen(false); setShowChangeOrder(true); if (!coItems.length) addCoItem() }} className="w-full text-left px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors font-medium">
                    Change Order
                  </button>
                )}
                <button onClick={() => { setMoreOpen(false); router.push(`/estimates?dup=${id}`) }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  Duplicate
                </button>
                {currentStatus === 'draft' && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Convert to</p>
                    <button onClick={() => handleConvert('interior')} disabled={converting} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                      {converting ? 'Converting…' : 'Interior'}
                    </button>
                    <button onClick={() => handleConvert('cabinet')} disabled={converting} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                      {converting ? 'Converting…' : 'Cabinet'}
                    </button>
                  </>
                )}
                <div className="border-t border-gray-100 my-1" />
                <button onClick={() => { setMoreOpen(false); handleDelete() }} disabled={deleting} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Client card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Prepared for</p>
              <h2 className="text-xl font-bold text-gray-900">{estimate.clientName || 'Unnamed Client'}</h2>
              {estimate.clientAddress && <p className="text-sm text-gray-500 mt-1">{estimate.clientAddress}</p>}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                {estimate.clientPhone && <span>{estimate.clientPhone}</span>}
                {estimate.clientEmail && <span>{estimate.clientEmail}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              {estimate.estimateNumber && <p className="text-2xl font-bold text-gray-900">#{estimate.estimateNumber}</p>}
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full mt-1 ${statusColor(currentStatus)}`}>
                {statusLabel(currentStatus)}
              </span>
            </div>
          </div>
        </div>

        {/* Pricing Summary */}
        {grandTotal > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white px-6 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider">Pricing Summary</h3>
              <span className="text-xs text-gray-400">{selectedBrandLabel}</span>
            </div>
            <div className="p-6">
              <div className="space-y-2.5 text-sm">
                {jobType !== 'structures' && paintingSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Exterior Painting — {selectedBrandLabel}</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(paintingSubtotal)}</span>
                  </div>
                )}
                {jobType !== 'exterior' && deckSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Deck{deckPaintLabel ? ` — ${deckPaintLabel}` : ''}</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(deckSubtotal)}</span>
                  </div>
                )}
                {jobType !== 'exterior' && pergolaSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pergola</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(pergolaSubtotal)}</span>
                  </div>
                )}
                {jobType !== 'exterior' && fenceSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fence{fencePaintLabel ? ` — ${fencePaintLabel}` : ''}</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(fenceSubtotal)}</span>
                  </div>
                )}
                {jobType !== 'exterior' && shedSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Shed{shedPaintLabel ? ` — ${shedPaintLabel}` : ''}</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(shedSubtotal)}</span>
                  </div>
                )}
                {woodTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Wood Replacement</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(woodTotal)}</span>
                  </div>
                )}
                {(estimate?.customItemsOpen ?? false) && (estimate?.customItems ?? []).filter(i => i.description && i.price > 0).map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span className="text-gray-600">{item.description}</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(item.price)}</span>
                  </div>
                ))}
                {combinedSubtotal > (paintingSubtotal || 0) && (
                  <div className="flex justify-between border-t border-gray-100 pt-2.5">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900 tabular-nums">{fmtD(combinedSubtotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-green-700">
                  <span>Discount ({(salesDiscount * 100).toFixed(0)}% — Sign Today)</span>
                  <span className="tabular-nums">− {fmtD(discountAmount)}</span>
                </div>
                {taxRate != null && taxAmount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Sales Tax ({(taxRate * 100).toFixed(1)}%)</span>
                    <span className="tabular-nums">+ {fmtD(taxAmount)}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-2.5 flex justify-between">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900 tabular-nums text-lg">{fmtD(grandTotal)}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                <div className="bg-brand-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-brand-500 font-medium mb-0.5">Deposit Due (20%)</p>
                  <p className="text-base font-bold text-brand-700">{fmtD(depositAmount)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Balance on Completion</p>
                  <p className="text-base font-bold text-gray-700">{fmtD(balanceDue)}</p>
                </div>
              </div>
              {(totals || structDetailsTotals.hours > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center text-xs text-gray-500">
                  <div>
                    <p className="font-semibold text-gray-700 text-sm">{((totals?.totalHours ?? 0) + structDetailsTotals.hours).toFixed(1)} hrs</p>
                    <p>Total Hours</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 text-sm">{fmtD((totals?.landm ?? 0) + structDetailsTotals.landm)}</p>
                    <p>Labor &amp; Materials</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 text-sm">{fmtD((totals?.totalPaintCost ?? 0) + (totals?.sundries ?? 0) + structDetailsTotals.paintCost + structDetailsTotals.sundries)}</p>
                    <p>Paint + Sundries</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Signature (if signed) */}
        {estimate.status === 'approved' && estimate.signatureName && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-green-800">Estimate Accepted</p>
                <p className="text-xs text-green-600">Signed by <strong>{estimate.signatureName}</strong>{estimate.signatureDate ? ` on ${estimate.signatureDate}` : ''}</p>
              </div>
            </div>
            {estimate.signatureDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={estimate.signatureDataUrl} alt="Signature" className="max-h-14 border border-green-200 rounded-lg bg-white px-4 py-2" />
            )}
          </div>
        )}

        {/* ── Payment status ───────────────────────────────────────────── */}
        {estimate.status === 'approved' && (estimate.depositPaid || estimate.balancePaid) && (() => {
          const totalPaid    = (estimate.depositPaid ? (estimate.depositPaidAmount ?? 0) : 0) + (estimate.balancePaid ? (estimate.balancePaidAmount ?? 0) : 0)
          const fullyPaid    = estimate.balancePaid
          const remaining    = Math.max(0, grandTotal - totalPaid)
          return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-emerald-600 text-white px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <h3 className="text-sm font-bold uppercase tracking-wider">Payments</h3>
              </div>
              <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${fullyPaid ? 'bg-white text-emerald-700' : 'bg-amber-400 text-amber-900'}`}>
                {fullyPaid ? 'Paid in Full' : 'Partially Paid'}
              </span>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {estimate.depositPaid
                    ? <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 rounded-full"><svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></span>
                    : <span className="inline-block w-5 h-5 rounded-full border-2 border-gray-200" />}
                  <span className={estimate.depositPaid ? 'text-gray-900 font-medium' : 'text-gray-400'}>Deposit</span>
                </div>
                <div className="text-right">
                  {estimate.depositPaid ? (
                    <>
                      <span className="font-semibold text-emerald-700">Paid</span>
                      {estimate.depositPaidMethod && <span className="text-gray-500 ml-1.5">· {estimate.depositPaidMethod}</span>}
                      {estimate.depositPaidAmount != null && <span className="text-gray-700 ml-1.5 tabular-nums">{fmtD(estimate.depositPaidAmount)}</span>}
                      {estimate.depositPaidAt && <p className="text-xs text-gray-400">{new Date(estimate.depositPaidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    </>
                  ) : <span className="text-gray-400">Pending</span>}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2">
                  {estimate.balancePaid
                    ? <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 rounded-full"><svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></span>
                    : <span className="inline-block w-5 h-5 rounded-full border-2 border-gray-200" />}
                  <span className={estimate.balancePaid ? 'text-gray-900 font-medium' : 'text-gray-400'}>Balance</span>
                </div>
                <div className="text-right">
                  {estimate.balancePaid ? (
                    <>
                      <span className="font-semibold text-emerald-700">Paid</span>
                      {estimate.balancePaidMethod && <span className="text-gray-500 ml-1.5">· {estimate.balancePaidMethod}</span>}
                      {estimate.balancePaidAmount != null && <span className="text-gray-700 ml-1.5 tabular-nums">{fmtD(estimate.balancePaidAmount)}</span>}
                      {estimate.balancePaidAt && <p className="text-xs text-gray-400">{new Date(estimate.balancePaidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    </>
                  ) : <span className="text-gray-400">Pending</span>}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t-2 border-gray-100 pt-3 mt-1 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Paid</span>
                  <span className="font-bold text-emerald-700 tabular-nums">{fmtD(totalPaid)}</span>
                </div>
                {!fullyPaid && remaining > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Remaining Balance</span>
                    <span className="font-semibold text-gray-700 tabular-nums">{fmtD(remaining)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          )
        })()}

        {/* ── Tax Correction result banner ─────────────────────────────── */}
        {corrResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <p className="text-sm font-bold text-blue-800 mb-2">✓ Tax Correction Applied</p>
            <div className="space-y-1 text-sm text-blue-700">
              <div className="flex justify-between"><span>New Total (with tax)</span><span className="font-semibold">{fmtD(corrResult.newGrandTotal)}</span></div>
              <div className="flex justify-between"><span>Deposit Already Paid</span><span className="font-semibold text-green-700">− {fmtD(parseFloat(corrDepositPaid))}</span></div>
              <div className="flex justify-between border-t border-blue-200 pt-1"><span className="font-bold">Remaining Balance</span><span className="font-bold">{fmtD(corrResult.remainingBalance)}</span></div>
            </div>
            {corrResult.invoiceUrl && (
              <a href={corrResult.invoiceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900 underline">
                View Invoice in GHL →
              </a>
            )}
          </div>
        )}

        {/* ── Admin: Tax Correction tool ────────────────────────────────── */}
        {estimate.status === 'approved' && estimate.salesTaxRate == null && (
          <div className="border-2 border-dashed border-amber-300 rounded-xl p-5 bg-amber-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Admin — Tax Correction</p>
                <p className="text-xs text-amber-600 mt-0.5">This signed estimate is missing sales tax. Add zip, select the correct brand, and create a corrected invoice.</p>
              </div>
              {!showTaxCorrection && (
                <button onClick={() => {
                  setShowTaxCorrection(true)
                  setCorrBrand(estimate.selectedBrand ?? 'superPaint')
                  setCorrPreTaxTotal(grandTotal > 0 ? grandTotal.toFixed(2) : '')
                  setCorrDepositPaid(estimate.signedDepositAmount != null ? String(estimate.signedDepositAmount) : '')
                }} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700">
                  Fix Now
                </button>
              )}
            </div>
            {showTaxCorrection && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Brand Used at Signing</p>
                    <select value={corrBrand} onChange={e => setCorrBrand(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                      <option value="superPaint">Super Paint</option>
                      <option value="duration">Duration</option>
                      <option value="emerald">Emerald</option>
                      <option value="emeraldRR">Emerald Rain Refresh</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Pre-Tax Total (post-discount)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" value={corrPreTaxTotal} onChange={e => setCorrPreTaxTotal(e.target.value)} placeholder="20373.47" className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Deposit Already Paid</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" value={corrDepositPaid} onChange={e => setCorrDepositPaid(e.target.value)} placeholder="4074.69" className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Property Zip Code</p>
                    <div className="flex gap-2">
                      <input type="text" value={corrZip} onChange={e => setCorrZip(e.target.value)} placeholder="98321" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      <button onClick={fetchCorrectionTaxRate} disabled={corrFetching || !corrZip.trim()} className="px-3 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap">
                        {corrFetching ? 'Looking up…' : 'Fetch Tax'}
                      </button>
                    </div>
                  </div>
                </div>
                {corrTaxRate != null && (
                  <div className="bg-white rounded-lg border border-amber-200 p-4 text-sm space-y-1.5">
                    <div className="flex justify-between text-gray-600"><span>Tax Rate ({corrTaxCity})</span><span className="font-medium">{(corrTaxRate * 100).toFixed(2)}%</span></div>
                    <div className="flex justify-between text-gray-600"><span>Pre-Tax Total</span><span className="font-medium">{fmtD(parseFloat(corrPreTaxTotal) || 0)}</span></div>
                    <div className="flex justify-between text-gray-600"><span>Sales Tax</span><span className="font-medium">+ {fmtD((parseFloat(corrPreTaxTotal) || 0) * corrTaxRate)}</span></div>
                    <div className="flex justify-between font-semibold text-gray-800 border-t pt-1.5"><span>New Grand Total</span><span>{fmtD(((parseFloat(corrPreTaxTotal) || 0) * (1 + corrTaxRate)))}</span></div>
                    <div className="flex justify-between text-green-700"><span>Deposit Paid</span><span>− {fmtD(parseFloat(corrDepositPaid) || 0)}</span></div>
                    <div className="flex justify-between font-bold text-gray-900 border-t pt-1.5 text-base"><span>Remaining Balance</span><span>{fmtD(((parseFloat(corrPreTaxTotal) || 0) * (1 + corrTaxRate)) - (parseFloat(corrDepositPaid) || 0))}</span></div>
                  </div>
                )}
                {corrError && <p className="text-xs text-red-600">{corrError}</p>}
                <div className="flex flex-wrap gap-2">
                  {estimate.clientContactId ? (
                    <>
                      <button
                        onClick={() => handleSaveTaxCorrection(false)}
                        disabled={corrSaving || corrTaxRate === null || !corrPreTaxTotal || !corrDepositPaid}
                        className="flex-1 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        {corrSaving ? 'Saving…' : 'Create Invoice (Draft)'}
                      </button>
                      <button
                        onClick={() => handleSaveTaxCorrection(true)}
                        disabled={corrSaving || corrTaxRate === null || !corrPreTaxTotal || !corrDepositPaid}
                        className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {corrSaving ? 'Saving…' : 'Create & Send to Client'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleSaveTaxCorrection(false)}
                      disabled={corrSaving || corrTaxRate === null || !corrPreTaxTotal || !corrDepositPaid}
                      className="flex-1 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {corrSaving ? 'Saving…' : 'Save Correction'}
                    </button>
                  )}
                  <button onClick={() => { setShowTaxCorrection(false); setCorrError(null) }} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Change Order Summary (if modified) */}
        {(estimate as typeof estimate & { isModified?: boolean; changeOrders?: {id:string;description:string;price:number}[] })?.isModified && (() => {
          const items       = (estimate as typeof estimate & { changeOrders?: {id:string;description:string;price:number}[] }).changeOrders ?? []
          const coTotal     = items.reduce((s,i) => s+(i.price||0), 0)
          const coDate      = (estimate as typeof estimate & { changeOrderDate?: string }).changeOrderDate
          const signedTotal = (estimate as typeof estimate & { signedGrandTotal?: number }).signedGrandTotal ?? 0
          const signedDep   = (estimate as typeof estimate & { signedDepositAmount?: number }).signedDepositAmount ?? 0
          const newTotal    = coResult?.newGrandTotal  ?? (signedTotal + coTotal)
          const newBal      = coResult?.newBalanceDue  ?? (newTotal - signedDep)
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Modified</span>
                  <h3 className="text-base font-semibold text-amber-900">Change Order</h3>
                  {coDate && <span className="text-xs text-amber-600">{coDate}</span>}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {signedTotal > 0 && <div className="flex justify-between text-gray-600"><span>Original Total</span><span className="tabular-nums">{fmtD(signedTotal)}</span></div>}
                {signedDep  > 0 && <div className="flex justify-between text-gray-600"><span>Deposit Paid</span><span className="tabular-nums text-green-600">− {fmtD(signedDep)}</span></div>}
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-amber-800">
                    <span>{item.description}</span>
                    <span className={`tabular-nums font-medium ${item.price >= 0 ? '' : 'text-green-700'}`}>{item.price >= 0 ? '+ ' : '− '}{fmtD(Math.abs(item.price))}</span>
                  </div>
                ))}
                <div className="border-t border-amber-300 pt-2 flex justify-between font-bold text-gray-900">
                  <span>New Balance Due</span>
                  <span className="tabular-nums">{fmtD(newBal)}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Change Order Panel */}
        {showChangeOrder && (
          <div className="bg-white border-2 border-amber-300 rounded-xl p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Change Order Items</h3>
            <div className="space-y-2 mb-3">
              {coItems.map((item, idx) => (
                <div key={item.id} className="flex gap-2 items-start">
                  <span className="text-xs text-gray-400 mt-2.5 shrink-0 w-4">{idx+1}</span>
                  <input type="text" value={item.description} onChange={e=>updateCoItem(item.id,'description',e.target.value)} placeholder="Description of change…" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" value={item.price||''} onChange={e=>updateCoItem(item.id,'price',parseFloat(e.target.value)||0)} placeholder="0.00" className="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <button onClick={()=>removeCoItem(item.id)} className="mt-1.5 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addCoItem} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800 mb-3">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              Add Item
            </button>
            <textarea value={coNotes} onChange={e=>setCoNotes(e.target.value)} placeholder="Notes (optional)…" rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none mb-3" />
            {coItems.length > 0 && (
              <div className="flex justify-between text-sm font-semibold text-gray-700 mb-3 px-1">
                <span>Change Order Total</span>
                <span>{coItems.reduce((s,i)=>s+(i.price||0),0) >= 0 ? '+' : ''}{fmtD(coItems.reduce((s,i)=>s+(i.price||0),0))}</span>
              </div>
            )}
            {coError && <p className="text-xs text-red-600 mb-2">{coError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSaveChangeOrder} disabled={coSaving||!coItems.length||!coItems.some(i=>i.description&&i.price!==0)} className="flex-1 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {coSaving ? 'Saving…' : 'Save Change Order'}
              </button>
              <button onClick={()=>{setShowChangeOrder(false);setCoItems([]);setCoError(null)}} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Scope of Work */}
        {(estimate.scopeProject || estimate.scopePrepWork || estimate.scopePainting) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Scope of Work</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm text-gray-700">
              {estimate.scopeProject      && <ScopeBlock label="Project"        text={estimate.scopeProject}      />}
              {estimate.scopePrepWork     && <ScopeBlock label="Prep Work"      text={estimate.scopePrepWork}     />}
              {estimate.scopePainting     && <ScopeBlock label="Painting"       text={estimate.scopePainting}     />}
              {estimate.scopeCleanUp      && <ScopeBlock label="Clean Up"       text={estimate.scopeCleanUp}      />}
              {estimate.scopeWalkThrough  && <ScopeBlock label="Walk Through"   text={estimate.scopeWalkThrough}  />}
              {estimate.scopePaintProducts && <ScopeBlock label="Paint Products" text={estimate.scopePaintProducts} />}
            </div>
          </div>
        )}

        {/* Photos */}
        {(estimate.photoUrls?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Photos ({estimate.photoUrls!.length})</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {estimate.photoUrls!.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Photo ${i + 1}`} className="aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, '_blank')} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScopeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="whitespace-pre-line text-gray-700 text-sm">{text}</p>
    </div>
  )
}
