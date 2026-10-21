import { useEffect, useMemo, useSyncExternalStore, type RefObject } from 'react'

export type StickyState = {
  /** The header is out of the flow (`fixed`): scrolled past its own height, or shown. */
  floating: boolean
  /** The fixed header is on screen. */
  shown: boolean
  /**
   * The header was already `fixed` before this change, so showing and hiding may animate. The switch from
   * the flow to `fixed` itself must not: it would slide the header in from its docked place.
   */
  animated: boolean
}

/** The page must be scrolled past this share of the screen before the fixed header may appear. */
export const SHOW_AFTER = 0.5
/** A direction change counts only after this many pixels the other way, so a trembling finger does not flicker it. */
export const DIRECTION_GAP = 8

const docked: StickyState = { floating: false, shown: false, animated: false }

/** The store behind `useStickyHeader`: separate from React so the scroll rules are testable on their own. */
export function createStickyStore() {
  let header: HTMLElement | null = null
  let state = docked
  let locked = false
  let direction: 'up' | 'down' = 'down'
  let anchor = 0
  let frame = 0
  const listeners = new Set<() => void>()

  const update = () => {
    const y = Math.max(0, window.scrollY)
    if (direction === 'down') {
      if (y > anchor) anchor = y
      else if (anchor - y >= DIRECTION_GAP) [direction, anchor] = ['up', y]
    } else if (y < anchor) anchor = y
    else if (y - anchor >= DIRECTION_GAP) [direction, anchor] = ['down', y]

    const height = header?.offsetHeight ?? 0
    // While locked (menu open, focus inside) a shown header stays, but never over the page top.
    const shown = (direction === 'up' && y > window.innerHeight * SHOW_AFTER) || (locked && state.shown && y > height)
    const floating = shown || y > height
    if (floating !== state.floating || shown !== state.shown) {
      state = { floating, shown, animated: state.floating && floating }
      listeners.forEach((listener) => listener())
    }
  }

  const schedule = () => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }

  return {
    subscribe(listener: () => void) {
      if (listeners.size === 0) {
        anchor = Math.max(0, window.scrollY)
        direction = 'down'
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        update()
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          window.removeEventListener('scroll', schedule)
          window.removeEventListener('resize', schedule)
          window.cancelAnimationFrame(frame)
          frame = 0
        }
      }
    },
    getSnapshot: () => state,
    setHeader(element: HTMLElement | null) {
      header = element
      if (listeners.size > 0) update()
    },
    setLocked(next: boolean) {
      if (next === locked) return
      locked = next
      if (listeners.size > 0) update()
    },
  }
}

/**
 * Scroll-driven state of the fixed header: it shows only on a scroll up, and only when the page is scrolled
 * more than half a screen. `locked` keeps a shown header from hiding. Also publishes `--sticky-header-offset`
 * on `html`, so sticky blocks can move below the visible header.
 */
export function useStickyHeader(headerRef: RefObject<HTMLElement | null>, locked: boolean): StickyState {
  const store = useMemo(() => createStickyStore(), [])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => docked)

  useEffect(() => {
    store.setHeader(headerRef.current)
  }, [store, headerRef])

  useEffect(() => {
    store.setLocked(locked)
  }, [store, locked])

  useEffect(() => {
    const style = document.documentElement.style
    style.setProperty('--sticky-header-offset', state.shown ? 'var(--header-height)' : '0px')
  }, [state.shown])
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--sticky-header-offset')
    },
    [],
  )

  return state
}
