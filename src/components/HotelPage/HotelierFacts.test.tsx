import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import type { Hotel } from '@/lib/catalog'
import { HotelierFacts } from './HotelierFacts'

const fetchMock = vi.fn<typeof fetch>()
const hotel = { ...getHotel('prague-old-town-lantern')!, id: 'ota-7480161' } as Hotel
const fact = (extra: object) => ({
  id: 'c1',
  characteristic: 'room.window_side',
  label: 'Сторона окон',
  room: 'Premium',
  value: 'во внутренний двор',
  status: 'reported',
  confidence: 0.75,
  observedAt: '2026-10-18T14:20:00.000Z',
  conflict: false,
  demo: true,
  limitations: [],
  source: null,
  ...extra,
})

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

// hotelier-demo, Requirement: Сведения отельера на странице отеля
describe('«Сведения отельера»', () => {
  it('shows the hotelier’s characteristics with the date, the confidence, the «демо» mark and the contradictions', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        hotelId: hotel.id,
        facts: [
          fact({ conflict: true }),
          fact({ id: 'c2', value: 'часть — на улицу', conflict: true, observedAt: '2026-10-24T13:05:00.000Z' }),
        ],
      }),
    )
    render(<HotelierFacts hotel={hotel} />)
    const list = await screen.findByRole('list', { name: 'Сведения отельера' })
    const [first] = within(list).getAllByRole('listitem')
    expect(first.textContent).toContain('Сторона окон · Premium')
    expect(first.textContent).toContain('во внутренний двор')
    expect(first.textContent).toContain('демо')
    expect(first.textContent).toContain('по словам отельера, 18 октября · уверенность 75 %')
    expect(within(list).getAllByText('Ответы отельера расходятся: уточняется')).toHaveLength(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/hotels/ota-7480161/hotelier/facts')
  })

  it('shows nothing without facts, and asks nothing for a synthetic hotel', async () => {
    fetchMock.mockResolvedValue(Response.json({ hotelId: hotel.id, facts: [] }))
    const { container, rerender } = render(<HotelierFacts hotel={hotel} />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    fetchMock.mockClear()
    rerender(<HotelierFacts hotel={{ ...hotel, id: 'prague-old-town-lantern' }} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
