'use client'

import { useState, useEffect, use } from 'react'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import { getWorkOrder, updateWorkOrder } from '@/lib/firebase/workOrders'
import { getSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'
import type { CompanySettings } from '@/types/settings'
import type { WorkOrderData } from '@/types/workOrder'

type WorkOrder = WorkOrderData & { id: string }

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const readonlyCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed'
const textareaCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1">{children}</label>
}

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [fullPrice, setFullPrice] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')

  // Form fields
  const [totalHours,          setTotalHours]          = useState('')
  const [materialsPrice,      setMaterialsPrice]      = useState('')
  const [jobNumber,           setJobNumber]           = useState('')
  const [crmLink,             setCrmLink]             = useState('')
  const [projectTotal,        setProjectTotal]        = useState('')
  const [painterPay,          setPayinterPay]         = useState('')
  const [colorChange,         setColorChange]         = useState('')
  const [numberOfColors,      setNumberOfColors]      = useState('')
  const [jobType,             setJobType]             = useState('')
  const [budgetHours,         setBudgetHours]         = useState('')
  const [materialsBudget,     setMaterialsBudget]     = useState('')
  const [paintsAndGallons,    setPaintsAndGallons]    = useState('')
  const [colorIds,            setColorIds]            = useState('')
  const [scopeOfWork,         setScopeOfWork]         = useState('')
  const [exclusionsAndNotes,  setExclusionsAndNotes]  = useState('')
  const [status,              setStatus]              = useState<WorkOrderData['status']>('new')

  useEffect(() => {
    getSettingsDoc<CompanySettings>('company', DEFAULT_COMPANY).then(setCompany).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    getWorkOrder(id).then(wo => {
      if (!wo) { setNotFound(true); setLoading(false); return }
      const w = wo as WorkOrder & { totalHours?: string; materialsPrice?: string; projectTotal?: string; fullPrice?: string; discountAmount?: string; photoUrls?: string[] }
      setWorkOrder(wo)
      setTotalHours(w.totalHours ?? '')
      setMaterialsPrice(w.materialsPrice ?? '')
      setProjectTotal(w.projectTotal ?? '')
      setFullPrice(w.fullPrice ?? '')
      setDiscountAmount(w.discountAmount ?? '')
      setPhotoUrls(w.photoUrls ?? [])
      setJobNumber(wo.jobNumber)
      setCrmLink(wo.crmLink)
      setPayinterPay(wo.painterPay)
      setColorChange(wo.colorChange)
      setNumberOfColors(wo.numberOfColors)
      setJobType(wo.jobType)
      setBudgetHours(wo.budgetHours)
      setMaterialsBudget(wo.materialsBudget)
      setPaintsAndGallons(wo.paintsAndGallons)
      setColorIds(wo.colorIds)
      setScopeOfWork(wo.scopeOfWork)
      setExclusionsAndNotes(wo.exclusionsAndNotes)
      setStatus(wo.status)
      setLoading(false)
    }).catch(() => { setNotFound(true); setLoading(false) })
  }, [id, user])

  function currentPayload() {
    return {
      totalHours, materialsPrice, projectTotal,
      jobNumber, crmLink, painterPay,
      colorChange, numberOfColors, jobType,
      budgetHours, materialsBudget,
      paintsAndGallons, colorIds,
      scopeOfWork, exclusionsAndNotes, status,
    }
  }

  async function handleSave() {
    if (!workOrder) return
    setSaving(true)
    setSaved(false)
    try {
      await updateWorkOrder(workOrder.id, currentPayload())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Save failed:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!workOrder) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Save latest edits first
      await updateWorkOrder(workOrder.id, currentPayload())

      const res = await fetch('/api/work-orders/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          workOrderId:  workOrder.id,
          clientName:   workOrder.clientName,
          clientAddress: workOrder.clientAddress,
          clientEmail:  workOrder.clientEmail,
          clientPhone:  workOrder.clientPhone,
          createdAt:    workOrder.createdAt,
          ...currentPayload(),
          companyName:    company.name,
          companyPhone:   company.phone,
          companyEmail:   company.email,
          companyAddress: `${company.streetAddress}, ${company.cityStateZip}`,
          companyLicense: company.licenseNumber ?? '',
          photoUrls,
        }),
      })
      const json = await res.json() as { success?: boolean; error?: string; pdfUrl?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Submit failed')
      setStatus('completed')
      setSubmitDone(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (notFound || !workOrder) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <p className="text-gray-500 font-medium">Work order not found.</p>
          <a href="/work-orders" className="text-sm text-brand-600 hover:text-brand-800 mt-2 inline-block">
            Back to Work Orders
          </a>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <a href="/work-orders" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Work Orders
              </a>
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <span className="text-sm text-gray-500">Work Order</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">
              {workOrder.clientName || 'Unnamed Client'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || submitting}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors shrink-0"
            >
              {saving ? <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />Saving…</> : saved ? <>✓ Saved</> : 'Save'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || saving || submitDone}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors shrink-0"
            >
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
              ) : submitDone ? (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Submitted!</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>Submit Work Order</>
              )}
            </button>
          </div>
        </div>

        {/* Customer Info */}
        <SectionCard title="Customer Info">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Name</FieldLabel>
                <input readOnly value={workOrder.clientName} className={readonlyCls} />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input readOnly value={workOrder.clientEmail} className={readonlyCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Address</FieldLabel>
                <input readOnly value={workOrder.clientAddress} className={readonlyCls} />
              </div>
              <div>
                <FieldLabel>Phone</FieldLabel>
                <input readOnly value={workOrder.clientPhone} className={readonlyCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Job #</FieldLabel>
                <input
                  type="text"
                  value={jobNumber}
                  onChange={e => setJobNumber(e.target.value)}
                  placeholder="e.g. 2025-001"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>CRM Link</FieldLabel>
                <input
                  type="text"
                  value={crmLink}
                  onChange={e => setCrmLink(e.target.value)}
                  placeholder="https://..."
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Submit error */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Submit failed: {submitError}
          </div>
        )}

        {/* Project Details */}
        <SectionCard title="Project Details">
          <div className="space-y-4">
            {/* Price breakdown for PM */}
            {fullPrice ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pricing Breakdown</p>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Full Price (before discount)</span>
                  <span className="font-medium text-gray-900">${parseFloat(fullPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {discountAmount && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Discount (10% — Sign Today)</span>
                    <span className="font-medium">− ${parseFloat(discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {discountAmount && (
                  <div className="flex justify-between text-sm text-gray-700 border-t border-gray-200 pt-2">
                    <span className="font-semibold">Net Price (after discount)</span>
                    <span className="font-semibold">${(parseFloat(fullPrice) - parseFloat(discountAmount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="font-bold text-brand-700">Total with Tax (what client pays)</span>
                  <span className="font-bold text-brand-700">{projectTotal ? `$${parseFloat(projectTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                </div>
              </div>
            ) : (
              <div className="bg-brand-50 border border-brand-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-500 mb-0.5">Total Project Price</p>
                  <p className="text-2xl font-bold text-brand-700">
                    {projectTotal ? `$${parseFloat(projectTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </p>
                </div>
                <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel>Painter Pay (L&amp;M)</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="text"
                    value={painterPay}
                    onChange={e => setPayinterPay(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-7`}
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Total Hours</FieldLabel>
                <input
                  type="text"
                  value={totalHours}
                  onChange={e => setTotalHours(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>Materials Price (Paint + Sundries)</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="text"
                    value={materialsPrice}
                    onChange={e => setMaterialsPrice(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-7`}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Color Change</FieldLabel>
                <select
                  value={colorChange}
                  onChange={e => setColorChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  <option value="Same Color">Same Color</option>
                  <option value="Change - Have">Change - Have</option>
                  <option value="Change - Need">Change - Need</option>
                </select>
              </div>
              <div>
                <FieldLabel># of Colors</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={numberOfColors}
                  onChange={e => setNumberOfColors(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>Job Type</FieldLabel>
                <select
                  value={jobType}
                  onChange={e => setJobType(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  <option value="Residential Exterior">Residential Exterior</option>
                  <option value="Commercial Exterior">Commercial Exterior</option>
                  <option value="Residential Interior">Residential Interior</option>
                  <option value="Commercial Interior">Commercial Interior</option>
                  <option value="Cabinet">Cabinet</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Paints &amp; Rough Estimate of Gallons</FieldLabel>
                <textarea
                  rows={3}
                  value={paintsAndGallons}
                  onChange={e => setPaintsAndGallons(e.target.value)}
                  placeholder={"Body: X Gal\nTrim: X Gal\nAccent/Other: X Gal"}
                  className={textareaCls}
                />
              </div>
              <div>
                <FieldLabel>Color ID&apos;s</FieldLabel>
                <textarea
                  rows={3}
                  value={colorIds}
                  onChange={e => setColorIds(e.target.value)}
                  placeholder="Enter color IDs…"
                  className={textareaCls}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Scope of Work */}
        <SectionCard title="Scope of Work">
          <textarea
            rows={8}
            value={scopeOfWork}
            onChange={e => setScopeOfWork(e.target.value)}
            placeholder="Describe the full scope of work…"
            className={textareaCls}
          />
        </SectionCard>

        {/* Exclusions & Other Notes */}
        <SectionCard title="Exclusions &amp; Other Notes">
          <textarea
            rows={5}
            value={exclusionsAndNotes}
            onChange={e => setExclusionsAndNotes(e.target.value)}
            placeholder="List any exclusions or additional notes…"
            className={textareaCls}
          />
        </SectionCard>

        {/* Photos */}
        {photoUrls.length > 0 && (
          <SectionCard title={`Project Photos (${photoUrls.length})`}>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {photoUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(url, '_blank')}
                />
              ))}
            </div>
          </SectionCard>
        )}

        {/* Status */}
        <SectionCard title="Status">
          <select
            value={status}
            onChange={e => setStatus(e.target.value as WorkOrderData['status'])}
            className={`${inputCls} max-w-xs`}
          >
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </SectionCard>

        {/* Bottom buttons */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            onClick={handleSave}
            disabled={saving || submitting}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {saving ? <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />Saving…</> : saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || saving || submitDone}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
            ) : submitDone ? (
              <>✓ Submitted!</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>Submit Work Order</>
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
