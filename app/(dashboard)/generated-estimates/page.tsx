'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import { listEstimates } from '@/lib/firebase/estimates'
import { listInteriorEstimates } from '@/lib/firebase/interiorEstimates'
import { listCabinetEstimates } from '@/lib/firebase/cabinetEstimates'

type GeneratedItem = {
  id:          string
  clientName:  string
  address:     string
  status:      string
  createdAt:   Date | string | undefined
  kind:        'exterior' | 'interior' | 'cabinet'
  proposalUrl: string
}

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-brand-50 text-brand-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-600',
}

const STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  sent:     'Sent',
  approved: 'Signed',
  rejected: 'Rejected',
}

const KIND_COLOR: Record<string, string> = {
  exterior: 'bg-blue-100 text-blue-600',
  interior: 'bg-purple-100 text-purple-600',
  cabinet:  'bg-amber-100 text-amber-700',
}

export default function GeneratedEstimatesPage() {
  const { user, role } = useAuth()
  const [items,   setItems]   = useState<GeneratedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copied,  setCopied]  = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    async function load() {
      const origin = window.location.origin
      try {
        let ext: GeneratedItem[] = []
        let int: GeneratedItem[] = []
        let cab: GeneratedItem[] = []

        if (role === 'admin') {
          const token = await user!.getIdToken()
          const res = await fetch('/api/admin/all-estimates', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const json = await res.json() as { exterior: Record<string, unknown>[]; interior: Record<string, unknown>[]; cabinet: Record<string, unknown>[] }
          ext = json.exterior.map(e => ({
            id: e.id as string, clientName: e.clientName as string ?? '', address: e.clientAddress as string ?? '',
            status: e.status as string ?? 'draft', createdAt: e.createdAt as string, kind: 'exterior' as const,
            proposalUrl: `${origin}/p/${e.id}`,
          }))
          int = json.interior.map(e => ({
            id: e.id as string, clientName: e.clientName as string, address: e.address as string,
            status: e.status as string, createdAt: e.createdAt as string, kind: 'interior' as const,
            proposalUrl: `${origin}/ip/${e.id}`,
          }))
          cab = json.cabinet.map(e => ({
            id: e.id as string, clientName: e.clientName as string, address: e.address as string,
            status: e.status as string, createdAt: e.createdAt as string, kind: 'cabinet' as const,
            proposalUrl: `${origin}/cp/${e.id}`,
          }))
        } else {
          const [exterior, interior, cabinet] = await Promise.all([
            listEstimates(user.uid),
            listInteriorEstimates(user.uid).catch(() => []),
            listCabinetEstimates(user.uid).catch(() => []),
          ])
          ext = exterior.map(e => ({
            id: e.id!, clientName: e.clientName ?? '', address: e.clientAddress ?? '',
            status: e.status ?? 'draft', createdAt: e.createdAt, kind: 'exterior' as const,
            proposalUrl: `${origin}/p/${e.id}`,
          }))
          int = interior.map(e => ({
            id: e.id, clientName: e.clientName, address: e.address,
            status: e.status, createdAt: e.createdAt, kind: 'interior' as const,
            proposalUrl: `${origin}/ip/${e.id}`,
          }))
          cab = cabinet.map(e => ({
            id: e.id, clientName: e.clientName, address: e.address,
            status: e.status, createdAt: e.createdAt, kind: 'cabinet' as const,
            proposalUrl: `${origin}/cp/${e.id}`,
          }))
        }

        const all = [...ext, ...int, ...cab].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt as string).getTime() : 0
          const tb = b.createdAt ? new Date(b.createdAt as string).getTime() : 0
          return tb - ta
        })
        setItems(all)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user, role])

  function handleCopy(e: React.MouseEvent, url: string) {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Generated Estimates</h1>
          <p className="text-sm text-gray-500 mt-1">All estimates with their shareable proposal links</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No estimates yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map(item => (
              <a
                key={item.id}
                href={item.proposalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors group gap-4"
              >
                {/* Left: client info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{item.clientName || 'Unnamed Client'}</p>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${KIND_COLOR[item.kind]}`}>
                      {item.kind}
                    </span>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[item.status] ?? STATUS_COLOR.draft}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{item.address || '—'}</p>
                  <p className="text-xs text-brand-500 mt-1 truncate">{item.proposalUrl}</p>
                </div>

                {/* Right: date + copy button + arrow */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-gray-400 tabular-nums hidden sm:block">
                    {item.createdAt ? new Date(item.createdAt as string).toLocaleDateString() : ''}
                  </span>
                  <button
                    onClick={e => handleCopy(e, item.proposalUrl)}
                    title="Copy link"
                    className="p-1.5 rounded-md text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all opacity-0 group-hover:opacity-100"
                  >
                    {copied === item.proposalUrl ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                    )}
                  </button>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
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
