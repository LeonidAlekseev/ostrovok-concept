import { describe, expect, it, vi } from 'vitest'
import { hotels } from '@/lib/catalogGenerator'
import RatesRoute from './rooms/page'
import HotelRoute, { generateStaticParams } from './page'

vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))

const params = (hotelId: string) => ({ params: Promise.resolve({ hotelId }) })

// hotel-page, Requirement: Страница отеля
describe('hotel routes', () => {
  it('prerender every catalogue hotel', async () => {
    expect(await generateStaticParams()).toHaveLength(hotels.length)
  })

  it('call notFound for an unknown id', async () => {
    await expect(HotelRoute(params('unknown'))).rejects.toMatchObject({ digest: expect.stringContaining('404') })
    await expect(RatesRoute(params('unknown'))).rejects.toMatchObject({ digest: expect.stringContaining('404') })
  })

  it('render a known hotel', async () => {
    expect(await HotelRoute(params('prague-old-town-lantern'))).toBeTruthy()
  })
})
