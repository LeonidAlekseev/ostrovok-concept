import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** `false` during prerender and hydration, `true` afterwards: lets a page wait for the stores. */
export const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
