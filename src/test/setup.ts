import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library unmounts on its own only when the runner exposes globals; this config does not.
afterEach(cleanup)

// jsdom cannot navigate and logs "Not implemented: navigation" for every link click. Cancel it after
// the components' own handlers have run (bubbling), so the tests still see the href and the clicks.
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault()
})
