'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** The edits wait this long for the next one before they are saved. */
export const SAVE_DELAY_MS = 800

export type SaveStatus = 'saved' | 'saving' | 'error'

/**
 * Saves `value` a moment after it stops changing; a failed save waits for `retry` (or the next edit). Only the
 * newest save reports: an older one finishing late does not override it. While edits are unsaved, leaving the
 * page asks first.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<{ error?: string }>) {
  const [saved, setSaved] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  const run = useCallback(async (next: T) => {
    const id = ++latest.current
    const result = await saveRef.current(next).catch(() => ({ error: 'Не удалось сохранить план' }))
    if (id !== latest.current) return
    if (result.error) setError(result.error)
    else {
      setError(null)
      setSaved(next)
    }
  }, [])

  useEffect(() => {
    if (value === saved) return
    const timer = setTimeout(() => void run(value), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [value, saved, run])

  const status: SaveStatus = value === saved ? 'saved' : error ? 'error' : 'saving'

  useEffect(() => {
    if (status === 'saved') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  return { status, error, retry: () => void run(value) }
}
