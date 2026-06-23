'use client'

import type { AutoSaveStatus } from '@/lib/useAutoSave'

/** Subtle inline "Saving… / Saved / Save failed" status for auto-saving forms. */
export default function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') return null

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <span className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        Saving…
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        Couldn&apos;t auto-save — your changes aren&apos;t saved yet
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      Saved
    </span>
  )
}
