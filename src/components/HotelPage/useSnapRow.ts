'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * A native scroll-snapping row of slides as wide as the row. `go` glides to a slide and selects it
 * at once; a swipe selects the slide it stops on. The slides passed on the way of `go` select nothing.
 * The row opens on the slide selected when it mounts.
 */
export function useSnapRow(selected: number, count: number, onSelect: (index: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  // The slide `go` scrolls to.
  const target = useRef<number | null>(null)

  useLayoutEffect(() => {
    const row = ref.current
    if (row) row.scrollLeft = selected * row.clientWidth
    // Only on mounting: later the row scrolls itself.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (index: number) => {
    onSelect(index)
    const row = ref.current
    if (!row || !row.clientWidth) return
    const left = index * row.clientWidth
    if (Math.abs(row.scrollLeft - left) < 1) return
    target.current = index
    row.scrollTo?.({ left, behavior: 'smooth' })
  }

  const onScroll = () => {
    const row = ref.current
    if (!row || !row.clientWidth) return
    const index = Math.round(row.scrollLeft / row.clientWidth)
    if (target.current !== null) {
      if (index === target.current) target.current = null
      return
    }
    if (index !== selected && index >= 0 && index < count) onSelect(index)
  }

  return { ref, go, onScroll }
}
