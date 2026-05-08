'use client'

import { useState, useEffect, use } from 'react'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import { getWorkOrder, updateWorkOrder } from '@/lib/firebase/workOrders'
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

  // Form fields
  const [jobNumber,           setJobNumber]           = useState('')
  const [crmLink,             setCrmLink]             = useState('')
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
    if (!user) return
    getWorkOrder(id).then(wo => {
      if (!wo) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setWorkOrder(wo)
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
    }).catch(() => {
      setNotFound(true)
      setLoading(false)
    })
  }, [id, user])

  async function handleSave() {
    if (!workOrder) return
    setSaving(true)
    setSaved(false)
    try {
      await updateWorkOrder(workOrder.id, {
        jobNumber,
        crmLink,
        painterPay,
        colorChange,
        numberOfColors,
        jobType,
        budgetHours,
        materialsBudget,
        paintsAndGallons,
        colorIds,
        scopeOfWork,
        exclusionsAndNotes,
        status,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Save failed:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 transition-colors shrink-0"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : saved ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
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

        {/* Project Details */}
        <SectionCard title="Project Details">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Painter Pay</FieldLabel>
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <FieldLabel>Budget Hours</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={budgetHours}
                  onChange={e => setBudgetHours(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>Materials Budget</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="text"
                    value={materialsBudget}
                    onChange={e => setMaterialsBudget(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-7`}
                  />
                </div>
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

        {/* Bottom save button */}
        <div className="flex justify-end pb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : saved ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
