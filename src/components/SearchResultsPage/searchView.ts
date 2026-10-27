import { useSyncExternalStore } from 'react'

/**
 * What the results page keeps for its entry of the history while the user visits a hotel page: the list or the map
 * on narrow screens, the camera of the map, the scroll of the page and the hotel opened last, so "Назад" (the
 * browser's button or the phone's gesture) returns to the same place. The query, the filters and the page are in
 * the address already.
 *
 * The entry carries its id in `history.state`, which Next keeps on "Назад" and "Вперёд"; the values live under the
 * id in sessionStorage, so they outlast the hotel page and a reload of the tab. A new entry — a new search, another
 * page of the list — starts with the view and the camera of the last one and its own scroll. The values belong to
 * one search, the query with the filters without the page: another `key` reads none.
 */

export type ResultsView = 'list' | 'map'

export interface MapCamera {
  center: [number, number]
  zoom: number
}

export interface SearchView {
  key: string
  view: ResultsView
  /** The last camera of the map; `null` before the map has framed the hotels. */
  camera: MapCamera | null
  /** The page's scroll when the user left it, px; `null` for a fresh entry. */
  scrollY: number | null
  /** The hotel opened from the list or the map, marked on return; `null` for none. */
  openedId: string | null
}

/** The field of `history.state` with the entry's id. */
const ENTRY = 'searchEntry'
const STORAGE_KEY = 'search-views'
/** Entries kept in sessionStorage: the oldest go first. */
const MAX_ENTRIES = 30

type Stored = Record<string, SearchView>

let state: (SearchView & { entry: string | null }) | null = null
const listeners = new Set<() => void>()

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function readStored(): Stored {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Stored) : {}
  } catch {
    return {}
  }
}

function writeStored(entry: string, view: SearchView) {
  const stored = readStored()
  delete stored[entry]
  stored[entry] = view
  const entries = Object.entries(stored).slice(-MAX_ENTRIES)
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // A full or blocked storage keeps the values in memory only.
  }
}

const entryOf = (): string | null => {
  const id: unknown = (window.history.state as Record<string, unknown> | null)?.[ENTRY]
  return typeof id === 'string' ? id : null
}

/** The values of the current entry: kept, stored, or carried over from the last entry. */
function current(): typeof state {
  const entry = entryOf()
  if (state && state.entry === entry) return state
  const stored = entry ? readStored()[entry] : undefined
  if (stored) state = { ...stored, entry }
  // A new entry: the view and the camera stay, the scroll and the opened hotel are the last entry's own.
  else if (state) state = { ...state, entry, scrollY: null, openedId: null }
  return state
}

/** The id of the current entry, given to it on the first save. */
function ensureEntry(): string {
  const entry = entryOf()
  if (entry) return entry
  const id = Math.random().toString(36).slice(2, 10)
  // With Next's own state: an update of the state alone, not a navigation.
  window.history.replaceState({ ...(window.history.state as object | null), [ENTRY]: id }, '')
  return id
}

/** The state to give `history.replaceState` with a new address: it keeps the entry's id. */
export function entryState(): Record<string, string> | null {
  const entry = entryOf()
  return entry ? { [ENTRY]: entry } : null
}

function save(key: string, values: Partial<SearchView>, notify: boolean) {
  const last = current()
  const next: SearchView =
    last?.key === key
      ? { key, view: last.view, camera: last.camera, scrollY: last.scrollY, openedId: last.openedId, ...values }
      : // Another search keeps only the list or the map.
        { key, view: last?.view ?? 'list', camera: null, scrollY: null, openedId: null, ...values }
  const entry = ensureEntry()
  state = { ...next, entry }
  writeStored(entry, next)
  if (notify) listeners.forEach((onChange) => onChange())
}

/** The key of a search: its URL query without the page and the opened hotel. */
export function searchViewKey(params: URLSearchParams, skip: readonly string[]): string {
  const next = new URLSearchParams(params)
  for (const name of skip) next.delete(name)
  return next.toString()
}

/** Shows the list or the map of the search `key`, keeping its camera. */
export const saveView = (key: string, view: ResultsView) => save(key, { view }, true)

/** Remembers the camera of the search `key`; nothing re-renders, the map already shows it. */
export const saveCamera = (key: string, camera: MapCamera) => save(key, { camera }, false)

/** Remembers the page's scroll; nothing re-renders. */
export const saveScroll = (key: string, scrollY: number) => save(key, { scrollY }, false)

/** Remembers the hotel being opened and the scroll at that moment, just before the hotel page. */
export const saveOpened = (key: string, openedId: string) => save(key, { openedId, scrollY: window.scrollY }, false)

/** The values of the current entry for the search `key`, or `null`: for what is read once, when the page shows. */
export function readSearchView(key: string): SearchView | null {
  const view = current()
  return view?.key === key ? view : null
}

/** The view kept for the search `key`, or `null` for another search. */
export function useSearchView(key: string): SearchView | null {
  const view = useSyncExternalStore(subscribe, current, () => null)
  return view?.key === key ? view : null
}

/** Forgets everything: for tests. */
export function resetSearchView() {
  state = null
  window.sessionStorage.removeItem(STORAGE_KEY)
}
