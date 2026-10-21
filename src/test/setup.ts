import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { sessionStore } from '@/lib/session'

// Testing Library unmounts on its own only when the runner exposes globals; this config does not.
afterEach(cleanup)
// The session lives in memory (Supabase's cookies in the app): no test inherits another's.
afterEach(() => sessionStore.set(null))

// jsdom cannot navigate and logs "Not implemented: navigation" for every link click. Cancel it after
// the components' own handlers have run (bubbling), so the tests still see the href and the clicks.
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault()
})

// jsdom has no layout and no element scrolling: scrollTo is a no-op, as for a strip without width.
Element.prototype.scrollTo ??= () => {}
