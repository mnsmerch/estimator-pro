'use client'

import { useState, useEffect, use } from 'react'
import { getEstimate } from '@/lib/firebase/estimates'
import type { EstimateData } from '@/types/estimate'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', approved: 'Approved', rejected: 'Rejected',
}

export default function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [estimate, setEstimate] = useState<EstimateData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEstimate(id).then(data => {
      setEstimate(data)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Estimate not found.</p>
      </div>
    )
  }

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
          <a href="/estimates" className="text-sm text-gray-500 hover:text-gray-800">← Estimates</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{estimate.clientName || 'Unnamed Client'}</h1>
            <p className="text-gray-500 mt-1">{estimate.clientAddress}</p>
          </div>
          <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
            {STATUS_LABEL[estimate.status] ?? estimate.status}
          </span>
        </div>

        {/* Client Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Client</h2>
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
            <div><span className="text-gray-400">Phone: </span>{estimate.clientPhone || '—'}</div>
            <div><span className="text-gray-400">Email: </span>{estimate.clientEmail || '—'}</div>
          </div>
        </section>

        {/* Rows */}
        {estimate.rows?.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Measurements ({estimate.rows.length} rows)</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-medium text-gray-500">Application</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Front</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Right</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Back</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Left</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {estimate.rows.map(row => {
                  const total = row.front + row.right + row.back + row.left
                  return (
                    <tr key={row.id}>
                      <td className="py-1.5 pr-4 text-gray-700">{row.applicationKey}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{row.front || '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{row.right || '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{row.back || '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{row.left || '—'}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums font-medium">{total || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Scope of Work */}
        {(estimate.scopePrepWork || estimate.scopePainting) && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Scope of Work</h2>
            <div className="grid grid-cols-2 gap-6 text-sm text-gray-700">
              {estimate.scopeProject && <ScopeBlock label="Project" text={estimate.scopeProject} />}
              {estimate.scopePrepWork && <ScopeBlock label="Prep Work" text={estimate.scopePrepWork} />}
              {estimate.scopePainting && <ScopeBlock label="Painting" text={estimate.scopePainting} />}
              {estimate.scopeCleanUp && <ScopeBlock label="Clean Up" text={estimate.scopeCleanUp} />}
              {estimate.scopeWalkThrough && <ScopeBlock label="Walk Through" text={estimate.scopeWalkThrough} />}
              {estimate.scopePaintProducts && <ScopeBlock label="Paint Products" text={estimate.scopePaintProducts} />}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function ScopeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="whitespace-pre-line text-gray-700">{text}</p>
    </div>
  )
}
