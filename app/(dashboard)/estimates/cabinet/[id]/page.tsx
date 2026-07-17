'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { updateCabinetEstimate, deleteCabinetEstimate } from '@/lib/firebase/cabinetEstimates'
import type { CabinetEstimateRecord } from '@/lib/firebase/cabinetEstimates'
import type { CompanySettings } from '@/types/settings'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'
import { calculateCabinet, sumCabinetCustomItems } from '@/types/cabinetEstimate'
import type { EstimateStatus } from '@/types/estimate'

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}
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

const STATUS_OPTIONS: { value: EstimateStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Signed' }, { value: 'declined', label: 'Declined' },
]

export default function CabinetEstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = use(params)
  const router   = useRouter()
  const { user } = useAuth()

  const [estimate,       setEstimate]       = useState<CabinetEstimateRecord | null>(null)
  const [company,        setCompany]        = useState<CompanySettings>(DEFAULT_COMPANY)
  const [loading,        setLoading]        = useState(true)
  const [statusOpen,     setStatusOpen]     = useState(false)
  const [moreOpen,       setMoreOpen]       = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [converting,     setConverting]     = useState(false)
  const [sendingEmail,   setSendingEmail]   = useState(false)
  const [emailDone,      setEmailDone]      = useState(false)
  const [creatingWO,     setCreatingWO]     = useState(false)
  const [woDone,         setWoDone]         = useState(false)
  const [showCO,         setShowCO]         = useState(false)
  const [coItems,        setCoItems]        = useState<{id:string;description:string;price:number}[]>([])
  const [coSaving,       setCoSaving]       = useState(false)
  const [retrigger,      setRetrigger]      = useState(false)
  const [retriggerDone,  setRetriggerDone]  = useState(false)
  const [retriggerError, setRetriggerError] = useState<string|null>(null)
  const [coError,        setCoError]        = useState<string|null>(null)
  const [coResult,       setCoResult]       = useState<{newGrandTotal:number;newBalanceDue:number;changeOrderTotal:number}|null>(null)

  const statusRef = useRef<HTMLDivElement>(null)
  const moreRef   = useRef<HTMLDivElement>(null)

  const cachedTotalSaved = useRef(false)
  useEffect(() => {
    fetch(`/api/cabinet-proposal/${id}`)
      .then(r => r.json())
      .then((d: { estimate: CabinetEstimateRecord; company: CompanySettings }) => {
        setEstimate(d.estimate); if (d.company) setCompany(d.company); setLoading(false)
      }).catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && estimate && !cachedTotalSaved.current) {
      cachedTotalSaved.current = true
      try {
        const bd = calculateCabinet(estimate)
        const ov = (estimate.subtotalOverride != null && estimate.subtotalOverride > 0) ? estimate.subtotalOverride : null
        const sub = ov ?? ((bd?.total ?? 0) + sumCabinetCustomItems(estimate.customItems))
        const dPct = estimate.discountPercent ?? 0.10
        const gt = (sub * (1 - dPct)) + ((estimate.salesTaxRate ?? null) != null ? sub * (1 - dPct) * (estimate.salesTaxRate as number) : 0)
        if (gt > 0) {
          fetch('/api/cache-grand-total', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estimateId: id, estimateType: 'cabinet', grandTotal: gt }),
          }).catch(() => {})
        }
      } catch { /* non-critical */ }
    }
  }, [loading, estimate, id])

  useEffect(() => {
    function h(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
      if (moreRef.current   && !moreRef.current.contains(e.target as Node))   setMoreOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function handleStatusChange(s: EstimateStatus) {
    if (!estimate) return
    setStatusOpen(false); setUpdatingStatus(true)
    try { await updateCabinetEstimate(id, { status: s } as Parameters<typeof updateCabinetEstimate>[1]); setEstimate(prev => prev ? { ...prev, status: s } as CabinetEstimateRecord : prev) }
    finally { setUpdatingStatus(false) }
  }
  async function handleDelete() {
    if (!confirm(`Delete estimate for "${estimate?.clientName}"?`)) return
    setDeleting(true)
    try { await deleteCabinetEstimate(id); router.replace('/estimates') }
    catch { alert('Delete failed.'); setDeleting(false) }
  }
  async function handleConvert(toType: 'exterior' | 'interior') {
    if (!user || converting) return
    setMoreOpen(false)
    if (!confirm(`Convert this cabinet estimate to ${toType}? Client info & photos carry over; the cabinet draft will be replaced.`)) return
    setConverting(true)
    try {
      const token = await user.getIdToken()
      const res   = await fetch('/api/convert-estimate-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estimateId: id, fromType: 'cabinet', toType }),
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
      await fetch('/api/send-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientName: estimate.clientName, clientAddress: estimate.address, clientPhone: estimate.clientPhone, clientEmail: estimate.clientEmail, clientContactId: estimate.clientContactId ?? '', clientFolderId: '', estimateUrl: `${window.location.origin}/cp/${id}`, estimateId: id, estimateType: 'cabinet' }) })
      setEmailDone(true); setTimeout(() => setEmailDone(false), 3000)
    } finally { setSendingEmail(false) }
  }
  async function handleCreateWO() {
    if (!estimate) return
    setMoreOpen(false); setCreatingWO(true)
    try {
      const res = await fetch('/api/work-orders/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estimateId: id, estimateType: 'cabinet', clientName: estimate.clientName, clientAddress: estimate.address ?? '', clientEmail: estimate.clientEmail, clientPhone: estimate.clientPhone, clientContactId: estimate.clientContactId ?? '', scopeOfWork: estimate.scope?.projectDescription ?? '', jobType: 'Cabinet' }) })
      const json = await res.json() as { workOrderId?: string }
      if (json.workOrderId) { setWoDone(true); setTimeout(() => router.push('/work-orders'), 800) }
    } finally { setCreatingWO(false) }
  }

  function addCoItem() { setCoItems(p => [...p, { id: crypto.randomUUID(), description: '', price: 0 }]) }
  function updateCoItem(cid: string, f: 'description'|'price', v: string|number) { setCoItems(p => p.map(i => i.id===cid?{...i,[f]:v}:i)) }
  function removeCoItem(cid: string) { setCoItems(p => p.filter(i => i.id !== cid)) }
  async function handleSaveCO() {
    if (!coItems.length || coSaving) return
    setCoSaving(true); setCoError(null)
    try {
      const res  = await fetch('/api/change-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estimateId: id, items: coItems }) })
      const json = await res.json() as { success?: boolean; error?: string; changeOrderTotal?: number; newGrandTotal?: number; newBalanceDue?: number }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed')
      setCoResult({ newGrandTotal: json.newGrandTotal!, newBalanceDue: json.newBalanceDue!, changeOrderTotal: json.changeOrderTotal! })
      setShowCO(false); setEstimate(prev => prev ? { ...prev, isModified: true, changeOrders: coItems } as typeof prev : prev)
    } catch (err) { setCoError(err instanceof Error ? err.message : 'Failed') }
    finally { setCoSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!estimate) return <div className="flex flex-col items-center justify-center py-32 gap-3"><p className="text-gray-500">Estimate not found.</p><a href="/estimates" className="text-sm text-brand-600">← Back</a></div>

  const currentStatus = estimate.status ?? 'draft'
  const isModified    = !!(estimate as typeof estimate & { isModified?: boolean }).isModified
  const existingCO    = (estimate as typeof estimate & { changeOrders?: typeof coItems }).changeOrders ?? []
  const bd            = calculateCabinet(estimate)
  const subtotalOverride = (estimate.subtotalOverride != null && estimate.subtotalOverride > 0) ? estimate.subtotalOverride : null

  // Per-estimate "Sign Today" discount (defaults to 10%).
  const discountPct      = estimate.discountPercent ?? 0.10
  const discountPctLabel = Math.round(discountPct * 100)

  // Live (recomputed) pricing — used only until the estimate is signed.
  const liveSubtotal  = subtotalOverride ?? ((bd?.total ?? 0) + sumCabinetCustomItems(estimate.customItems))
  const liveTaxRate   = estimate.salesTaxRate ?? null
  const liveDiscounted = liveSubtotal * (1 - discountPct)
  const liveTax       = liveTaxRate ? liveDiscounted * liveTaxRate : 0
  const liveGrand     = liveDiscounted + liveTax

  // PRICE LOCK: once signed (approved), show the exact agreed price from the
  // stored signed* fields — never recompute from live settings.
  const lk = estimate.status === 'approved'
    ? (estimate as typeof estimate & {
        signedGrandTotal?: number; signedSubtotal?: number; signedTaxAmount?: number; signedTaxRate?: number
        signedDepositAmount?: number; signedBalanceDue?: number; signedDepositPercent?: number
      })
    : null
  const isLocked = lk?.signedGrandTotal != null

  let subtotal: number, taxAmount: number, grandTotal: number, depositAmt: number, balanceDue: number, taxRate: number | null
  if (isLocked) {
    grandTotal = lk!.signedGrandTotal!
    taxRate    = lk!.signedTaxRate ?? liveTaxRate
    depositAmt = lk!.signedDepositAmount ?? Math.round(grandTotal * (lk!.signedDepositPercent ?? 0.20) * 100) / 100
    balanceDue = lk!.signedBalanceDue ?? Math.round((grandTotal - depositAmt) * 100) / 100
    subtotal   = lk!.signedSubtotal ?? (taxRate != null ? grandTotal / (1 + taxRate) / (1 - discountPct) : grandTotal / (1 - discountPct))
    taxAmount  = lk!.signedTaxAmount ?? Math.round((grandTotal - subtotal * (1 - discountPct)) * 100) / 100
  } else {
    subtotal   = liveSubtotal
    taxRate    = liveTaxRate
    taxAmount  = liveTax
    grandTotal = liveGrand
    depositAmt = Math.round(grandTotal * 0.20 * 100) / 100
    balanceDue = Math.round((grandTotal - depositAmt) * 100) / 100
  }

  async function handleRetrigger() {
    if (!estimate || retrigger) return
    setRetrigger(true); setRetriggerError(null)
    try {
      // 1. Save pricing to Firestore so the callback can use it
      await fetch('/api/accept-estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimateId: id, estimateType: 'cabinet',
          signatureName: estimate.signatureName ?? '',
          depositAmount: depositAmt, balanceDue, depositPercent: 0.20,
          grandTotal: Math.round(grandTotal * 100) / 100,
          taxRate: taxRate ?? null,
        }),
      })
      // 2. Fire the GHL webhook to find/create the contact
      const addr = (estimate.address ?? '').split(',')
      await fetch('https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/5590c13c-51a2-4ccf-9446-45f85557c79c', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimateId:     id,
          callbackUrl:    `${window.location.origin}/api/webhook/attach-contact`,
          clientName:     estimate.clientName,
          clientEmail:    estimate.clientEmail,
          clientPhone:    estimate.clientPhone,
          clientAddress1: addr[0]?.trim() ?? '',
          estimateType:   'cabinet',
          estimateUrl:    `${window.location.origin}/cp/${id}`,
          grandTotal:     Math.round(grandTotal * 100) / 100,
          depositAmount:  depositAmt,
          balanceDue,
          depositPercent: 0.20,
          taxRate:        taxRate ?? 0,
        }),
      })
      setRetriggerDone(true)
    } catch (err) {
      setRetriggerError(err instanceof Error ? err.message : 'Failed')
    } finally { setRetrigger(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Action bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-2 flex-wrap">
          <a href="/estimates" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mr-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg><span className="hidden sm:inline">Estimates</span></a>
          <h1 className="text-sm font-bold text-gray-900 mr-auto">{estimate.estimateNumber ? `Estimate #${estimate.estimateNumber}` : estimate.clientName}</h1>
          <a href={`/estimates/cabinet/${id}/edit`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>Edit</a>
          <button onClick={handleEmail} disabled={sendingEmail} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-50 ${emailDone?'border-green-300 text-green-700 bg-green-50':'border-gray-300 text-gray-700 hover:bg-gray-50'}`}><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>{emailDone?'Sent!':sendingEmail?'Sending…':'Email'}</button>
          <div className="relative" ref={statusRef}>
            <button onClick={()=>setStatusOpen(v=>!v)} disabled={updatingStatus} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${statusColor(currentStatus)}`}>
              {updatingStatus?<div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"/>:statusLabel(currentStatus)}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>
            </button>
            {statusOpen && <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">{STATUS_OPTIONS.map(opt=><button key={opt.value} onClick={()=>handleStatusChange(opt.value)} className={`w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50 ${currentStatus===opt.value?'text-brand-700 bg-brand-50':'text-gray-700'}`}>{opt.label}</button>)}</div>}
          </div>
          <a href={`/cp/${id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg><span className="hidden sm:inline">View Proposal</span></a>
          <div className="relative" ref={moreRef}>
            <button onClick={()=>setMoreOpen(v=>!v)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">More <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg></button>
            {moreOpen && <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
              <button onClick={handleCreateWO} disabled={creatingWO||woDone} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">{creatingWO?'Creating…':woDone?'✓ Work Order Created':'Create Work Order'}</button>
              {estimate.status==='approved' && <button onClick={()=>{setMoreOpen(false);setShowCO(true);if(!coItems.length)addCoItem()}} className="w-full text-left px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 font-medium">Change Order</button>}
              <button onClick={()=>{setMoreOpen(false);router.push(`/estimates?dup=${id}`)}} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">Duplicate</button>
              {currentStatus==='draft' && <>
                <div className="border-t border-gray-100 my-1"/>
                <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Convert to</p>
                <button onClick={()=>handleConvert('exterior')} disabled={converting} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">{converting?'Converting…':'Exterior'}</button>
                <button onClick={()=>handleConvert('interior')} disabled={converting} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">{converting?'Converting…':'Interior'}</button>
              </>}
              <div className="border-t border-gray-100 my-1"/>
              <button onClick={()=>{setMoreOpen(false);handleDelete()}} disabled={deleting} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">{deleting?'Deleting…':'Delete'}</button>
            </div>}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Client */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Prepared for</p>
              <h2 className="text-xl font-bold text-gray-900">{estimate.clientName}</h2>
              {estimate.address && <p className="text-sm text-gray-500 mt-1">{estimate.address}</p>}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                {estimate.clientPhone && <span>{estimate.clientPhone}</span>}
                {estimate.clientEmail && <span>{estimate.clientEmail}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              {estimate.estimateNumber && <p className="text-2xl font-bold text-gray-900">#{estimate.estimateNumber}</p>}
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full mt-1 ${statusColor(currentStatus)}`}>{statusLabel(currentStatus)}</span>
            </div>
          </div>
        </div>

        {/* Pricing */}
        {grandTotal > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white px-6 py-3"><h3 className="text-sm font-bold uppercase tracking-wider">Pricing Summary</h3></div>
            <div className="p-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Cabinet Painting</span><span className="font-medium tabular-nums">{fmtD(subtotal)}</span></div>
              <div className="flex justify-between text-green-700"><span>Discount ({discountPctLabel}%)</span><span className="tabular-nums">− {fmtD(subtotal*discountPct)}</span></div>
              {taxRate && taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>Sales Tax ({(taxRate*100).toFixed(1)}%)</span><span className="tabular-nums">+ {fmtD(taxAmount)}</span></div>}
              <div className="border-t border-gray-100 pt-2 flex justify-between"><span className="font-bold text-gray-900">Total</span><span className="font-bold text-gray-900 tabular-nums text-lg">{fmtD(grandTotal)}</span></div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-brand-50 rounded-lg p-3 text-center"><p className="text-xs text-brand-500 font-medium mb-0.5">Deposit (20%)</p><p className="text-base font-bold text-brand-700">{fmtD(depositAmt)}</p></div>
                <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500 font-medium mb-0.5">Balance on Completion</p><p className="text-base font-bold text-gray-700">{fmtD(balanceDue)}</p></div>
              </div>
            </div>
          </div>
        )}

        {/* Change Order Summary */}
        {(coResult||(isModified&&existingCO.length>0)) && (() => {
          const items=coResult?coItems:existingCO; const coTotal=items.reduce((s,i)=>s+(i.price||0),0)
          const stored=estimate as typeof estimate & {signedGrandTotal?:number;signedDepositAmount?:number}
          const newTotal=coResult?.newGrandTotal??((stored.signedGrandTotal??0)+coTotal)
          const newBal=coResult?.newBalanceDue??(newTotal-(stored.signedDepositAmount??0))
          return <div className="bg-amber-50 border border-amber-200 rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Modified</span><p className="text-sm font-semibold text-amber-900">Change Order</p></div><div className="space-y-1.5 text-sm">{items.map(item=><div key={item.id} className="flex justify-between text-amber-800"><span>{item.description}</span><span className="tabular-nums">{item.price>=0?'+ ':'− '}{fmtD(Math.abs(item.price))}</span></div>)}<div className="border-t border-amber-200 pt-2 flex justify-between font-bold text-gray-900"><span>New Balance Due</span><span className="tabular-nums">{fmtD(newBal)}</span></div></div></div>
        })()}

        {/* Change Order Form */}
        {showCO && <div className="bg-white border-2 border-amber-300 rounded-xl p-6"><h3 className="text-base font-bold text-gray-900 mb-4">Change Order Items</h3><div className="space-y-2 mb-3">{coItems.map((item,idx)=><div key={item.id} className="flex gap-2 items-start"><span className="text-xs text-gray-400 mt-2.5 w-4 shrink-0">{idx+1}</span><input type="text" value={item.description} onChange={e=>updateCoItem(item.id,'description',e.target.value)} placeholder="Description…" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/><div className="relative w-28 shrink-0"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span><input type="number" step="0.01" value={item.price||''} onChange={e=>updateCoItem(item.id,'price',parseFloat(e.target.value)||0)} placeholder="0.00" className="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div><button onClick={()=>removeCoItem(item.id)} className="mt-1.5 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button></div>)}</div><button onClick={addCoItem} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800 mb-3"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>Add Item</button>{coError&&<p className="text-xs text-red-600 mb-2">{coError}</p>}<div className="flex gap-2"><button onClick={handleSaveCO} disabled={coSaving||!coItems.length||!coItems.some(i=>i.description&&i.price!==0)} className="flex-1 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50">{coSaving?'Saving…':'Save Change Order'}</button><button onClick={()=>{setShowCO(false);setCoItems([]);setCoError(null)}} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button></div></div>}

        {/* Signature */}
        {estimate.status==='approved' && estimate.signatureName && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2"><div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div><div><p className="text-sm font-bold text-green-800">Estimate Accepted</p><p className="text-xs text-green-600">Signed by <strong>{estimate.signatureName}</strong>{estimate.signatureDate?` on ${estimate.signatureDate}`:''}</p></div></div>
            {estimate.signatureDataUrl && <img src={estimate.signatureDataUrl} alt="Signature" className="max-h-14 border border-green-200 rounded-lg bg-white px-4 py-2"/>}

            {/* Re-trigger GHL invoice process for old signed estimates with no contactId */}
            {!estimate.clientContactId && grandTotal > 0 && (
              <div className="mt-4 pt-4 border-t border-green-200">
                {retriggerDone ? (
                  <p className="text-sm font-semibold text-green-700">✓ Sent to GHL — invoices will be created shortly once the contact is matched.</p>
                ) : retriggerError ? (
                  <p className="text-sm text-red-600">{retriggerError}</p>
                ) : (
                  <button onClick={handleRetrigger} disabled={retrigger} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors">
                    {retrigger ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Processing…</> : <>↺ Trigger Invoice Process</>}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scope */}
        {estimate.scope?.projectDescription && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Scope of Work</h3>
            <p className="text-sm text-gray-700 whitespace-pre-line">{estimate.scope.projectDescription}</p>
          </div>
        )}

        {/* Photos */}
        {(estimate.photoUrls?.length??0)>0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Photos ({estimate.photoUrls!.length})</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {estimate.photoUrls!.map((url,i)=><img key={i} src={url} alt="" className="aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90" onClick={()=>window.open(url,'_blank')}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
