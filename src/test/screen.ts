/** Widths of the two layouts the app tells apart with `min-width` queries (the wide one is the desktop). */
export const WIDE = 1280
export const NARROW = 390

/**
 * Sets the screen width for the `matchMedia` queries of the components. jsdom has no `matchMedia`, and the code that
 * checks it (`!window.matchMedia || …`) then takes the wide layout without saying so: a test that depends on the
 * layout sets it here, in `beforeEach`, and the next test sets its own.
 */
export function setScreen(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query)
    return {
      matches: min !== null && width >= Number(min[1]),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList
  }) as unknown as typeof window.matchMedia
}
