import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library unmounts on its own only when the runner exposes globals; this config does not.
afterEach(cleanup)
