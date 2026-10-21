import { useSyncExternalStore } from 'react'

/**
 * What the results page keeps while the user visits a hotel page: the list or the map on narrow
 * screens, and the camera of the map, so "Назад" returns to the same place. Only in the memory of the
 * tab, for one search: its key is the query with the filters, without the page and the opened hotel.
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
}

let state: SearchView | null = null
const listeners = new Set<() => void>()

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** The key of a search: its URL query without the page and the opened hotel. */
export function searchViewKey(params: URLSearchParams, skip: readonly string[]): string {
  const next = new URLSearchParams(params)
  for (const name of skip) next.delete(name)
  return next.toString()
}

/** Shows the list or the map of the search `key`, keeping its camera. */
export function saveView(key: string, view: ResultsView) {
  state = { key, view, camera: state?.key === key ? state.camera : null }
  listeners.forEach((onChange) => onChange())
}

/** Remembers the camera of the search `key`; nothing re-renders, the map already shows it. */
export function saveCamera(key: string, camera: MapCamera) {
  state = { key, view: state?.key === key ? state.view : 'list', camera }
}

/** The view kept for the search `key`, or `null` for another search. */
export function useSearchView(key: string): SearchView | null {
  const view = useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  )
  return view?.key === key ? view : null
}

/** Forgets everything: for tests. */
export function resetSearchView() {
  state = null
}
