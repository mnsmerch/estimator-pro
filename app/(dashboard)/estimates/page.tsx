'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { listEstimates, deleteEstimate } from '@/lib/firebase/estimates'
import { listInteriorEstimates, deleteInteriorEstimate } from '@/lib/firebase/interiorEstimates'
import type { EstimateData } from '@/types/estimate'

type ListItem = {
  id:         string
  clientName: string
  address:    string
  status:     string
  createdAt:  Date | string | undefined
  kind:       'exterior' | 'interior'
}

// ─── constants ───────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'draft' | 'sent' | 'approved'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'All'    },
  { key: 'draft',    label: 'Draft'  },
  { key: 'sent',     label: 'Sent'   },
  { key: 'approved', label: 'Signed' },
]

const STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  sent:     'Sent',
  approved: 'Signed',
  rejected: 'Rejected',
}

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-brand-50 text-brand-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-600',
}

// ─── component ───────────────────────────────────────────────────────────────

export default function EstimatesPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [estimates, setEstimates]   = useState<ListItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<FilterKey>('all')
  const [modalOpen, setModalOpen]   = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    Promise.all([
      listEstimates(user.uid),
      listInteriorEstimates(user.uid),
    ]).then(([exterior, interior]) => {
      const ext: ListItem[] = exterior.map(e => ({
        id: e.id!, clientName: e.clientName ?? '', address: e.clientAddress ?? '',
        status: e.status ?? 'draft', createdAt: e.createdAt, kind: 'exterior',
      }))
      const int: ListItem[] = interior.map(e => ({
        id: e.id, clientName: e.clientName, address: e.address,
        status: e.status, createdAt: e.createdAt, kind: 'interior',
      }))
      const all = [...ext, ...int].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt as string).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt as string).getTime() : 0
        return tb - ta
      })
      setEstimates(all)
      setLoading(false)
    })
  }, [user])

  // Close modal on Escape
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen])

  async function handleDelete(e: React.MouseEvent, item: ListItem) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete estimate for "${item.clientName || 'Unnamed Client'}"? This cannot be undone.`)) return
    setDeletingId(item.id)
    if (item.kind === 'interior') await deleteInteriorEstimate(item.id)
    else await deleteEstimate(item.id)
    setEstimates(prev => prev.filter(est => est.id !== item.id))
    setDeletingId(null)
  }

  const filtered = filter === 'all'
    ? estimates
    : estimates.filter(e => e.status === filter)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Global header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
        </div>
        <nav className="flex items-center gap-5">
          <a href="/dashboard" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Dashboard</a>
          <a href="/estimates" className="text-sm text-brand-600 font-semibold transition-colors">Estimates</a>
          <a href="/contracts" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Contracts</a>
          <a href="/settings" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Settings</a>
        </nav>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* Page title row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Estimates</h1>
            <p className="text-sm text-gray-500 mt-1">Create and manage all your estimates</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 active:bg-brand-800 transition-colors"
            >
              + New Estimate
            </button>
          </div>
        </div>

        {/* Filter pill row */}
        <div className="flex items-center gap-2 mb-6">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Estimates list ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            {filter === 'all' ? (
              <>
                <p className="text-gray-500 mb-4">No estimates yet.</p>
                <button
                  onClick={() => setModalOpen(true)}
                  className="inline-block px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Create your first estimate
                </button>
              </>
            ) : (
              <p className="text-gray-500">
                No <span className="font-medium">{FILTERS.find(f => f.key === filter)?.label.toLowerCase()}</span> estimates.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {filtered.map(est => {
              const href = est.kind === 'interior'
                ? `/estimates/interior/${est.id}/edit`
                : est.status === 'draft' ? `/estimates/${est.id}/edit` : `/estimates/${est.id}`
              return (
                <a
                  key={est.id}
                  href={href}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{est.clientName || 'Unnamed Client'}</p>
                      {est.kind === 'interior' && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                          Interior
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{est.address || '—'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[est.status] ?? STATUS_COLOR.draft}`}>
                      {STATUS_LABEL[est.status] ?? est.status}
                    </span>
                    <span className="text-sm text-gray-400 tabular-nums">
                      {est.createdAt ? new Date(est.createdAt as string).toLocaleDateString() : ''}
                    </span>
                    <button
                      onClick={e => handleDelete(e, est)}
                      disabled={deletingId === est.id}
                      className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                      aria-label="Delete estimate"
                    >
                      {deletingId === est.id ? (
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </main>

      {/* ── New Estimate modal ───────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">

            {/* Close button */}
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-0.5">New Estimate</h2>
            <p className="text-sm text-gray-500 mb-5">Choose estimate type</p>

            <div className="flex flex-col gap-3">

              {/* Exterior — active */}
              <button
                onClick={() => { setModalOpen(false); router.push('/estimates/new') }}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors group"
              >
                <p className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
                  Exterior Estimate
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Exterior painting, wood replacement, prep work
                </p>
              </button>

              {/* Interior — active */}
              <button
                onClick={() => { setModalOpen(false); router.push('/estimates/interior/new') }}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors group"
              >
                <p className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
                  Interior Estimate
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Interior rooms, ceilings, trim
                </p>
              </button>

              {/* Cabinet — coming soon */}
              <div className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 cursor-not-allowed opacity-60">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-500">Cabinet Estimate</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                    Coming soon
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">Cabinet painting and refinishing</p>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
