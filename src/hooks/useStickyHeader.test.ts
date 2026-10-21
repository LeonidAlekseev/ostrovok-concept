import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStickyStore } from './useStickyHeader'

const HEIGHT = 72
let y = 0
const frames: (() => void)[] = []

const scrollTo = (next: number) => {
  y = next
  window.dispatchEvent(new Event('scroll'))
  frames.splice(0).forEach((cb) => cb())
}

// A "screen" of 800 px: the 50 % threshold is 400 px.
const setup = () => {
  const store = createStickyStore()
  store.setHeader({ offsetHeight: HEIGHT } as HTMLElement)
  const unsubscribe = store.subscribe(() => {})
  return { store, unsubscribe }
}

beforeEach(() => {
  y = 0
  const listeners = new Map<string, Set<() => void>>()
  vi.stubGlobal('window', {
    get scrollY() {
      return y
    },
    innerHeight: 800,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    dispatchEvent: (event: Event) => listeners.get(event.type)?.forEach((fn) => fn()),
    requestAnimationFrame: (cb: () => void) => frames.push(cb),
    cancelAnimationFrame: () => {},
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('createStickyStore', () => {
  it('stays docked at the top and while scrolling down', () => {
    const { store } = setup()
    scrollTo(30)
    expect(store.getSnapshot()).toEqual({ floating: false, shown: false, animated: false })
    scrollTo(2000)
    expect(store.getSnapshot()).toEqual({ floating: true, shown: false, animated: false })
  })

  it('does not animate the switch to fixed, only the later show and hide', () => {
    const { store } = setup()
    scrollTo(2000)
    expect(store.getSnapshot()).toMatchObject({ floating: true, shown: false, animated: false })
    scrollTo(1900)
    expect(store.getSnapshot()).toMatchObject({ shown: true, animated: true })
    scrollTo(2100)
    expect(store.getSnapshot()).toMatchObject({ shown: false, animated: true })
  })

  it('shows on a scroll up when scrolled past half a screen, and hides on a scroll down', () => {
    const { store } = setup()
    scrollTo(2000)
    scrollTo(1900)
    expect(store.getSnapshot()).toEqual({ floating: true, shown: true, animated: true })
    scrollTo(2000)
    expect(store.getSnapshot()).toEqual({ floating: true, shown: false, animated: true })
  })

  it('never shows below half a screen, even on a scroll up', () => {
    const { store } = setup()
    scrollTo(300)
    scrollTo(200)
    expect(store.getSnapshot().shown).toBe(false)
    scrollTo(399)
    scrollTo(380)
    expect(store.getSnapshot().shown).toBe(false)
  })

  it('hides when a scroll up goes back under half a screen', () => {
    const { store } = setup()
    scrollTo(2000)
    scrollTo(1000)
    expect(store.getSnapshot().shown).toBe(true)
    scrollTo(300)
    expect(store.getSnapshot()).toEqual({ floating: true, shown: false, animated: true })
    scrollTo(40)
    expect(store.getSnapshot()).toEqual({ floating: false, shown: false, animated: false })
  })

  it('ignores a direction change smaller than 8 px', () => {
    const { store } = setup()
    scrollTo(2000)
    scrollTo(1995)
    expect(store.getSnapshot().shown).toBe(false)
    scrollTo(1992)
    expect(store.getSnapshot().shown).toBe(true)
    scrollTo(1996)
    expect(store.getSnapshot().shown).toBe(true)
    scrollTo(2000)
    expect(store.getSnapshot().shown).toBe(false)
  })

  it('keeps a shown header while locked and hides it once unlocked', () => {
    const { store } = setup()
    scrollTo(2000)
    scrollTo(1900)
    store.setLocked(true)
    scrollTo(2100)
    expect(store.getSnapshot().shown).toBe(true)
    store.setLocked(false)
    expect(store.getSnapshot().shown).toBe(false)
  })

  it('does not show a hidden header because it is locked', () => {
    const { store } = setup()
    scrollTo(2000)
    store.setLocked(true)
    expect(store.getSnapshot().shown).toBe(false)
  })
})
