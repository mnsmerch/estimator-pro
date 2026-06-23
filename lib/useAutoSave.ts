'use client'

import { useEffect, useRef, useState } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Debounced auto-save.
 *
 * Watches a serialized `signature` of the form's saved fields. When it changes
 * (and `enabled` is true), it waits `delay` ms of inactivity and then calls
 * `onSave`. The very first signature is captured silently so opening/editing a
 * record never triggers a spurious save, and identical content is never saved
 * twice in a row.
 *
 * `onSave` and `enabled` are read through refs, so passing inline values does
 * not retrigger the effect on every render — only a real `signature` change
 * schedules a save.
 */
export function useAutoSave(opts: {
  signature: string
  enabled: boolean
  delay?: number
  onSave: () => Promise<void>
}): AutoSaveStatus {
  const { signature, enabled, delay = 1500, onSave } = opts

  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved  = useRef<string | null>(null)
  const inFlight   = useRef(false)
  const firstRun   = useRef(true)
  const onSaveRef  = useRef(onSave)
  const enabledRef = useRef(enabled)

  // Keep the latest onSave/enabled in refs so the debounce effect below only
  // reruns on a real signature change, not on every render.
  useEffect(() => {
    onSaveRef.current  = onSave
    enabledRef.current = enabled
  })

  useEffect(() => {
    // Capture the initial state without saving (hydration on mount).
    if (firstRun.current) {
      firstRun.current = false
      lastSaved.current = signature
      return
    }
    if (!enabledRef.current) return
    if (signature === lastSaved.current) return

    if (timer.current) clearTimeout(timer.current)
    const sig = signature
    timer.current = setTimeout(async () => {
      if (inFlight.current || !enabledRef.current) return
      inFlight.current = true
      setStatus('saving')
      try {
        await onSaveRef.current()
        lastSaved.current = sig
        setStatus('saved')
      } catch {
        setStatus('error')
      } finally {
        inFlight.current = false
      }
    }, delay)

    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [signature, delay])

  return status
}
