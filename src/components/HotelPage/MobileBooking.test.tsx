import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { MobileBooking } from './MobileBooking'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Раскладка панели цены
describe('MobileBooking', () => {
  let observed: { cb: IntersectionObserverCallback; target: Element }[] = []

  beforeEach(() => {
    observed = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe(target: Element) {
          observed.push({ cb: this.cb, target })
        }
        disconnect() {}
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  // The mark after the bar is in view once the bar has reached its place above the footer, out of view while the bar hangs over the content.
  const reportMark = (isIntersecting: boolean) =>
    act(() => {
      const { cb, target } = observed[0]
      cb([{ isIntersecting, target } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

  it('hangs over the content with a card background and shadow, and fades them at its place', () => {
    const { container } = render(<MobileBooking hotel={hotel} />)
    const bar = container.firstElementChild as HTMLElement
    expect(bar.className).toMatch(/\bsticky\b/)
    expect(bar.className).toMatch(/\bbg-card\b/)
    expect(bar.className).toMatch(/shadow-\(--shadow-card\)/)
    expect(bar.className).toMatch(/\btransition-\[background-color,box-shadow\]/)
    expect(bar.className).toMatch(/\bmotion-reduce:transition-none\b/)

    reportMark(true)
    expect(bar.className).not.toMatch(/\bbg-card\b/)
    expect(bar.className).toMatch(/\bbg-transparent\b/)
    expect(bar.className).toMatch(/\bshadow-none\b/)

    reportMark(false)
    expect(bar.className).toMatch(/\bbg-card\b/)
    expect(bar.className).toMatch(/shadow-\(--shadow-card\)/)
  })
})
