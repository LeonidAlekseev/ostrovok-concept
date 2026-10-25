import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { MobileBooking } from './MobileBooking'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Раскладка панели цены
describe('MobileBooking', () => {
  it('is flat: the sticky bar has no card background and no shadow', () => {
    const { container } = render(<MobileBooking hotel={hotel} />)
    const bar = container.firstElementChild as HTMLElement
    expect(bar.className).toMatch(/\bsticky\b/)
    expect(bar.className).not.toMatch(/\bbg-card\b/)
    expect(bar.className).not.toMatch(/\bshadow/)
  })
})
