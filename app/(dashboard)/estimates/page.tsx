'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { listEstimates, deleteEstimate } from '@/lib/firebase/estimates'
import { listInteriorEstimates, deleteInteriorEstimate } from '@/lib/firebase/interiorEstimates'
import { listCabinetEstimates, deleteCabinetEstimate } from '@/lib/firebase/cabinetEstimates'
import type { EstimateData } from '@/types/estimate'

type ListItem = {
  id:              string
  clientName:      string
  address:         string
  status:          string
  createdAt:       Date | string | undefined
  kind:            'exterior' | 'interior' | 'cabinet'
  estimateNumber?: number
  grandTotal?:     number
}

type FilterKey = 'all' | 'draft' | 'pending' | 'signed' | 'declined'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'All'      },
  { key: 'draft',    label: 'Draft'    },
  { key: 'pending',  label: 'Pending'  },
  { key: 'signed',   label: 'Signed'   },
  { key: 'declined', label: 'Declined' },
]

// Maps raw Firestore status → display group
function statusGroup(status: string): FilterKey {
  if (status === 'approved')                    return 'signed'
  if (status === 'declined' || status === 'rejected') return 'declined'
  if (status === 'pending' || status === 'sent') return 'pending'
  return 'draft'
}

const STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  pending:  'Pending',
  sent:     'Pending',
  approved: 'Signed',
  rejected: 'Declined',
  declined: 'Declined',
}

const STATUS_PILL: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  pending:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  sent:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  declined: 'bg-red-50 text-red-600 ring-1 ring-red-200',
}

const KIND_BADGE: Record<string, string> = {
  exterior: 'bg-blue-50 text-blue-600',
  interior: 'bg-purple-50 text-purple-600',
  cabinet:  'bg-amber-50 text-amber-700',
}

function fmtMonth(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function fmtDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EstimatesPage() {
  const { user, role } = useAuth()
  const router = useRouter()

  const [items,        setItems]        = useState<ListItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState<FilterKey>('all')
  const [search,       setSearch]       = useState('')
  const [modalOpen,    setModalOpen]    = useState(false)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [dupItem,      setDupItem]      = useState<ListItem | null>(null)
  const [dupName,      setDupName]      = useState('')
  const [duplicating,  setDuplicating]  = useState(false)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [convertMenuId, setConvertMenuId] = useState<string | null>(null)
  const [convertingId,  setConvertingId]  = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        let ext: ListItem[] = []
        let int: ListItem[] = []
        let cab: ListItem[] = []

        if (role === 'admin' || role === 'estimator' || role === 'pm') {
          const token = await user!.getIdToken()
          const res   = await fetch('/api/admin/all-estimates', { headers: { Authorization: `Bearer ${token}` } })
          const json  = await res.json() as { exterior: EstimateData[]; interior: Record<string, unknown>[]; cabinet: Record<string, unknown>[] }
          ext = json.exterior.map(e => ({
            id: e.id!, clientName: e.clientName ?? '', address: e.clientAddress ?? '',
            status: e.status ?? 'draft', createdAt: e.createdAt, kind: 'exterior' as const,
            estimateNumber: (e as EstimateData & { estimateNumber?: number }).estimateNumber,
            grandTotal: e.signedGrandTotal ?? e.cachedGrandTotal,
          }))
          int = json.interior.map(e => {
            const r = e as Record<string, unknown>
            return { id: e.id as string, clientName: e.clientName as string, address: e.address as string, status: e.status as string, createdAt: e.createdAt as string, kind: 'interior' as const, estimateNumber: e.estimateNumber as number | undefined, grandTotal: (r.signedGrandTotal ?? r.cachedGrandTotal) as number | undefined }
          })
          cab = json.cabinet.map(e => {
            const r = e as Record<string, unknown>
            return { id: e.id as string, clientName: e.clientName as string, address: e.address as string, status: e.status as string, createdAt: e.createdAt as string, kind: 'cabinet' as const, estimateNumber: e.estimateNumber as number | undefined, grandTotal: (r.signedGrandTotal ?? r.cachedGrandTotal) as number | undefined }
          })
        } else {
          const [exterior, interior, cabinet] = await Promise.all([
            listEstimates(user!.uid),
            listInteriorEstimates(user!.uid).catch(() => []),
            listCabinetEstimates(user!.uid).catch(() => []),
          ])
          ext = exterior.map(e => ({
            id: e.id!, clientName: e.clientName ?? '', address: e.clientAddress ?? '',
            status: e.status ?? 'draft', createdAt: e.createdAt, kind: 'exterior' as const,
            estimateNumber: e.estimateNumber,
            grandTotal: e.signedGrandTotal ?? e.cachedGrandTotal,
          }))
          int = interior.map(e => {
            const r = e as unknown as Record<string, unknown>
            return { id: e.id, clientName: e.clientName, address: e.address, status: e.status, createdAt: e.createdAt, kind: 'interior' as const, grandTotal: (r.signedGrandTotal ?? r.cachedGrandTotal) as number | undefined }
          })
          cab = cabinet.map(e => {
            const r = e as unknown as Record<string, unknown>
            return { id: e.id, clientName: e.clientName, address: e.address, status: e.status, createdAt: e.createdAt, kind: 'cabinet' as const, grandTotal: (r.signedGrandTotal ?? r.cachedGrandTotal) as number | undefined }
          })
        }

        const all = [...ext, ...int, ...cab].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt as string).getTime() : 0
          const tb = b.createdAt ? new Date(b.createdAt as string).getTime() : 0
          return tb - ta
        })
        setItems(all)

        // Background: fetch prices for estimates missing a grand total
        const missing = all.filter(i => !i.grandTotal)
        if (missing.length > 0) {
          const apiFor = (item: ListItem) => {
            if (item.kind === 'interior') return `/api/interior-proposal/${item.id}`
            if (item.kind === 'cabinet')  return `/api/cabinet-proposal/${item.id}`
            return `/api/proposal/${item.id}`
          }
          missing.forEach((item, idx) => {
            setTimeout(() => {
              fetch(apiFor(item))
                .then(r => r.json())
                .then((d: { cachedGrandTotal?: number }) => {
                  if (d.cachedGrandTotal && d.cachedGrandTotal > 0) {
                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, grandTotal: d.cachedGrandTotal } : i))
                  }
                })
                .catch(() => {})
            }, idx * 200)
          })
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    load()
  }, [user, role])

  // Close modal on Escape
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen])

  function openDuplicateModal(e: React.MouseEvent, item: ListItem) {
    e.preventDefault(); e.stopPropagation()
    setDupItem(item)
    setDupName(`${item.clientName || 'Unnamed Client'} (copy)`)
  }

  async function handleDuplicate() {
    if (!dupItem || !user) return
    setDuplicating(true)
    try {
      const token = await user.getIdToken()
      const res   = await fetch('/api/duplicate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estimateId: dupItem.id, estimateType: dupItem.kind, newClientName: dupName }),
      })
      const json = await res.json() as { newId?: string; error?: string }
      if (!res.ok || !json.newId) throw new Error(json.error ?? 'Failed')
      setItems(prev => [{
        id: json.newId!, clientName: dupName, address: dupItem.address,
        status: 'draft', createdAt: new Date().toISOString(), kind: dupItem.kind,
      }, ...prev])
      setDupItem(null)
    } catch (err) {
      alert(`Duplicate failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setDuplicating(false) }
  }

  async function handleDelete(e: React.MouseEvent, item: ListItem) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm(`Delete estimate for "${item.clientName || 'Unnamed Client'}"? This cannot be undone.`)) return
    setDeletingId(item.id)
    try {
      if (item.kind === 'interior')      await deleteInteriorEstimate(item.id)
      else if (item.kind === 'cabinet')  await deleteCabinetEstimate(item.id)
      else                               await deleteEstimate(item.id)
      setItems(prev => prev.filter(e => e.id !== item.id))
    } catch { alert('Failed to delete. Please try again.') }
    finally { setDeletingId(null) }
  }

  async function handleConvert(item: ListItem, toType: 'exterior' | 'interior' | 'cabinet') {
    if (!user || convertingId) return
    setConvertMenuId(null)
    if (!confirm(`Convert this ${item.kind} estimate to ${toType}? Client info & photos carry over; the ${item.kind} draft will be replaced.`)) return
    setConvertingId(item.id)
    try {
      const token = await user.getIdToken()
      const res   = await fetch('/api/convert-estimate-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estimateId: item.id, fromType: item.kind, toType }),
      })
      const json = await res.json() as { editUrl?: string; error?: string }
      if (!res.ok || !json.editUrl) throw new Error(json.error ?? 'Failed')
      router.push(json.editUrl)
    } catch (err) {
      alert(`Convert failed: ${err instanceof Error ? err.message : String(err)}`)
      setConvertingId(null)
    }
  }

  // Clear selection when filter or search changes
  useEffect(() => { setSelected(new Set()) }, [filter, search])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(i => i.id)))
    }
  }

  async function handleBulkDelete() {
    if (!selected.size) return
    if (!confirm(`Delete ${selected.size} estimate${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkDeleting(true)
    try {
      await Promise.all(
        items
          .filter(i => selected.has(i.id))
          .map(i => {
            if (i.kind === 'interior') return deleteInteriorEstimate(i.id)
            if (i.kind === 'cabinet')  return deleteCabinetEstimate(i.id)
            return deleteEstimate(i.id)
          })
      )
      setItems(prev => prev.filter(i => !selected.has(i.id)))
      setSelected(new Set())
    } catch { alert('Some deletes failed. Please try again.') }
    finally { setBulkDeleting(false) }
  }

  // Filtered + searched list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      const group = statusGroup(item.status)
      const matchesFilter = filter === 'all' || group === filter
      const matchesSearch = !q || item.clientName.toLowerCase().includes(q) || item.address.toLowerCase().includes(q) || String(item.estimateNumber ?? '').includes(q)
      return matchesFilter && matchesSearch
    })
  }, [items, filter, search])

  // Group by month
  const grouped = useMemo(() => {
    const groups: { month: string; date: Date; items: ListItem[] }[] = []
    for (const item of filtered) {
      const date  = item.createdAt ? new Date(item.createdAt as string) : new Date()
      const month = fmtMonth(date)
      const existing = groups.find(g => g.month === month)
      if (existing) existing.items.push(item)
      else groups.push({ month, date, items: [item] })
    }
    return groups
  }, [filtered])

  function editHref(item: ListItem) {
    if (item.kind === 'interior') return `/estimates/interior/${item.id}/edit`
    if (item.kind === 'cabinet')  return `/estimates/cabinet/${item.id}/edit`
    return `/estimates/${item.id}/edit`
  }

  function openHref(item: ListItem) {
    if (item.kind === 'interior') return `/estimates/interior/${item.id}`
    if (item.kind === 'cabinet')  return `/estimates/cabinet/${item.id}`
    return `/estimates/${item.id}`
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estimates</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 active:bg-brand-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Estimate
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 text-sm font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {bulkDeleting ? (
              <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
            {bulkDeleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, address, or estimate #…"
          className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === f.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            {search ? `No results for "${search}"` : `No ${filter === 'all' ? '' : filter + ' '}estimates yet.`}
          </p>
          {filter === 'all' && !search && (
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700"
            >
              Create your first estimate
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Select All bar */}
          <div className="flex items-center gap-3 px-1">
            <input
              type="checkbox"
              checked={filtered.length > 0 && selected.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length }}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
            />
            <span className="text-sm text-gray-500">
              {selected.size > 0 ? `${selected.size} of ${filtered.length} selected` : `Select all ${filtered.length}`}
            </span>
          </div>

          {grouped.map(group => (
            <div key={group.month}>
              {/* Month header */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{group.month}</h2>
              </div>

              {/* Estimates in this month */}
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {group.items.map(item => {
                  const date = item.createdAt ? new Date(item.createdAt as string) : null
                  const isSelected = selected.has(item.id)
                  return (
                    <div key={item.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-brand-600 cursor-pointer shrink-0"
                      />
                      {/* Left: info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a href={openHref(item)} className="font-semibold text-gray-900 hover:text-brand-700 transition-colors truncate">
                            {item.clientName || 'Unnamed Client'}
                            {item.estimateNumber && (
                              <span className="font-normal text-gray-400 ml-1">— #{item.estimateNumber}</span>
                            )}
                          </a>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${KIND_BADGE[item.kind]}`}>
                            {item.kind}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[item.status] ?? STATUS_PILL.draft}`}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>
                          {date && <span className="text-xs text-gray-400">{fmtDate(date)}</span>}
                          {item.grandTotal && item.grandTotal > 0 && (
                            <span className="text-xs font-semibold text-gray-700 tabular-nums sm:hidden">
                              {item.grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          )}
                          {item.address && <span className="text-xs text-gray-400 truncate hidden sm:block">{item.address}</span>}
                        </div>
                      </div>

                      {/* Price */}
                      {item.grandTotal && item.grandTotal > 0 && (
                        <div className="hidden sm:block text-right shrink-0 mr-1">
                          <p className="text-sm font-bold text-gray-900 tabular-nums">
                            {item.grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      )}

                      {/* Right: actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={openHref(item)}
                          className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Open
                        </a>
                        <a
                          href={editHref(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                          </svg>
                          Edit
                        </a>
                        {/* Convert type — drafts only */}
                        {statusGroup(item.status) === 'draft' && (
                          <div className="relative">
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); setConvertMenuId(convertMenuId === item.id ? null : item.id) }}
                              disabled={convertingId === item.id}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                              title="Convert type"
                            >
                              {convertingId === item.id ? (
                                <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                </svg>
                              )}
                            </button>
                            {convertMenuId === item.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={e => { e.preventDefault(); e.stopPropagation(); setConvertMenuId(null) }} />
                                <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
                                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Convert to</p>
                                  {(['exterior', 'interior', 'cabinet'] as const).filter(t => t !== item.kind).map(t => (
                                    <button
                                      key={t}
                                      onClick={e => { e.preventDefault(); e.stopPropagation(); handleConvert(item, t) }}
                                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 capitalize"
                                    >
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {/* Overflow actions */}
                        <button
                          onClick={e => openDuplicateModal(e, item)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          title="Duplicate"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                          </svg>
                        </button>
                        <button
                          onClick={e => handleDelete(e, item)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === item.id
                            ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          }
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Duplicate modal */}
      {dupItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDupItem(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
            <button onClick={() => setDupItem(null)} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-0.5">Duplicate Estimate</h2>
            <p className="text-sm text-gray-500 mb-5">A new draft will be created with the same data.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimate name</label>
            <input
              type="text" value={dupName} onChange={e => setDupName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && dupName.trim()) handleDuplicate() }}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-5"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={handleDuplicate} disabled={duplicating || !dupName.trim()} className="flex-1 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {duplicating ? 'Duplicating…' : 'Duplicate'}
              </button>
              <button onClick={() => setDupItem(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New Estimate modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
            <button onClick={() => setModalOpen(false)} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-0.5">New Estimate</h2>
            <p className="text-sm text-gray-500 mb-5">Choose estimate type</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setModalOpen(false); router.push('/estimates/new') }} className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors group">
                <p className="font-semibold text-gray-900 group-hover:text-brand-700">Exterior Estimate</p>
                <p className="text-sm text-gray-500 mt-0.5">Exterior painting, wood replacement, prep work</p>
              </button>
              <button onClick={() => { setModalOpen(false); router.push('/estimates/interior/new') }} className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors group">
                <p className="font-semibold text-gray-900 group-hover:text-brand-700">Interior Estimate</p>
                <p className="text-sm text-gray-500 mt-0.5">Interior rooms, ceilings, trim</p>
              </button>
              <button onClick={() => { setModalOpen(false); router.push('/estimates/cabinet/new') }} className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors group">
                <p className="font-semibold text-gray-900 group-hover:text-brand-700">Cabinet Estimate</p>
                <p className="text-sm text-gray-500 mt-0.5">Cabinet painting and refinishing</p>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
