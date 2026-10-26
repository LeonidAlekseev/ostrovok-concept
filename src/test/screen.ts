/** Widths of the two layouts the app tells apart with `min-width` queries (the wide one is the desktop). */
export const WIDE = 1280
export const NARROW = 390

/**
 * Sets the screen for the `matchMedia` queries of the components: its width for `(min-width: Npx)` and `(min-width:
 * Nrem)` (16 px to the rem), and `reducedMotion` for `(prefers-reduced-motion: reduce)`. jsdom has no `matchMedia`,
 * and the code that checks it (`!window.matchMedia || …`) then takes the wide layout without saying so: a test that
 * depends on the layout or on the motion sets them here, in `beforeEach`, and the next test sets its own.
 */
export function setScreen(width: number, { reducedMotion = false }: { reducedMotion?: boolean } = {}) {
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+)(px|rem)\)/.exec(query)
    const minWidth = min && Number(min[1]) * (min[2] === 'rem' ? 16 : 1)
    return {
      matches: /prefers-reduced-motion/.test(query) ? reducedMotion : minWidth !== null && width >= minWidth,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList
  }) as unknown as typeof window.matchMedia
}
