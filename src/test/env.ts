/**
 * The tests' environment, outside production by default: a test calls `setProduction(true)` and resets it after.
 * The browser tests have it from src/test/setup.ts; a unit test mocks it itself:
 * `vi.mock('@/lib/env', () => import('@/test/env'))`. The bindings are live: the code reads the current value.
 */
export let appEnv = 'test'
export let isProduction = false

export function setProduction(production: boolean) {
  isProduction = production
  appEnv = production ? 'production' : 'test'
}
