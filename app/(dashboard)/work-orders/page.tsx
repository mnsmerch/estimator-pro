'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import { listWorkOrders, deleteWorkOrder } from '@/lib/firebase/workOrders'
import type { WorkOrderData } from '@/types/workOrder'

type WorkOrderItem = WorkOrderData & { id: string }

const STATUS_LABEL: Record<string, string> = {
  new:         'New',
  in_progress: 'In Progress',
  completed:   'Completed',
}

const STATUS_COLOR: Record<string, string> = {
  new:         'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
}

export default function WorkOrdersPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>([])
  const [loading,    setLoading]    = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    listWorkOrders(user.uid)
      .then(items => {
        setWorkOrders(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user])

  async function handleDelete(e: React.MouseEvent, item: WorkOrderItem) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete work order for "${item.clientName || 'Unnamed Client'}"? This cannot be undone.`)) return
    setDeletingId(item.id)
    try {
      await deleteWorkOrder(item.id)
      setWorkOrders(prev => prev.filter(w => w.id !== item.id))
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Failed to delete work order. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* Page title row */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and track all active work orders</p>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : workOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No work orders yet</p>
            <p className="text-sm text-gray-400 mt-1">Work orders are created automatically when clients sign proposals.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {workOrders.map(wo => (
              <a
                key={wo.id}
                href={`/work-orders/${wo.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{wo.clientName || 'Unnamed Client'}</p>
                    {wo.jobType && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full shrink-0">
                        {wo.jobType}
                      </span>
                    )}
                    {!wo.jobType && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0">
                        {wo.estimateType === 'interior' ? 'Interior' : 'Exterior'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{wo.clientAddress || '—'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[wo.status] ?? STATUS_COLOR.new}`}>
                    {STATUS_LABEL[wo.status] ?? wo.status}
                  </span>
                  <span className="text-sm text-gray-400 tabular-nums hidden sm:block">
                    {wo.createdAt ? new Date(wo.createdAt).toLocaleDateString() : ''}
                  </span>
                  <button
                    onClick={e => handleDelete(e, wo)}
                    disabled={deletingId === wo.id}
                    className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                    aria-label="Delete work order"
                  >
                    {deletingId === wo.id ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
