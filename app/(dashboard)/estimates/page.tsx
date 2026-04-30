'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { listEstimates } from '@/lib/firebase/estimates'
import type { EstimateData } from '@/types/estimate'

const STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  sent:     'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-600',
}

export default function EstimatesPage() {
  const { user } = useAuth()
  const [estimates, setEstimates] = useState<EstimateData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    listEstimates(user.uid).then(data => {
      setEstimates(data)
      setLoading(false)
    })
  }, [user])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/settings" className="text-sm text-gray-600 hover:text-gray-900 font-medium">Settings</a>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Estimates</h1>
          <a
            href="/estimates/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + New Estimate
          </a>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : estimates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-4">No estimates yet.</p>
            <a
              href="/estimates/new"
              className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Create your first estimate
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {estimates.map(est => (
              <a
                key={est.id}
                href={`/estimates/${est.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">{est.clientName || 'Unnamed Client'}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{est.clientAddress || '—'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[est.status] ?? STATUS_COLOR.draft}`}>
                    {STATUS_LABEL[est.status] ?? est.status}
                  </span>
                  <span className="text-sm text-gray-400">
                    {est.createdAt ? new Date(est.createdAt).toLocaleDateString() : ''}
                  </span>
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
