'use client'

import { useEffect, useState } from 'react'

/**
 * The state of a full-screen dialog that the browser's "Назад" closes: opening adds a history entry
 * at the same address, and every other way of closing goes back over it, so the entry never lingers.
 * `value` is `null` while closed.
 */
export function useHistoryDialog<T>() {
  const [value, setValue] = useState<T | null>(null)
  const isOpen = value !== null

  useEffect(() => {
    if (!isOpen) return
    const onPopState = () => setValue(null)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isOpen])

  return {
    value,
    open: (next: T) => {
      if (!isOpen) window.history.pushState(null, '')
      setValue(next)
    },
    close: () => window.history.back(),
  }
}
