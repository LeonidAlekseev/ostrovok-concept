import { useSyncExternalStore } from 'react'
import { bookingsStore, favoritesStore, sessionStore, type Store } from '../lib/storage'

/** The store's value; empty during prerender and hydration. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServerSnapshot)
}

export const useSession = () => useStore(sessionStore)
export const useFavorites = () => useStore(favoritesStore)
export const useBookings = () => useStore(bookingsStore)
export const useIsFavorite = (hotelId: string) => useFavorites().includes(hotelId)
