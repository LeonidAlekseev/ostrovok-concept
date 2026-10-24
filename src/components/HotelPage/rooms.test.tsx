import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { destinations } from '@/data/destinations'
import { getHotel } from '@/lib/catalogGenerator'
import { parseOffer } from '@/lib/offer'
import { RoomRates } from '../RatesPage/RoomRates'
import { RoomList } from './RoomList'

const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const guests = { adults: 2, children: 0, rooms: 1 }
const future = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const stay = { checkIn: future(10), checkOut: future(13), guests }
const noop = () => {}

// hotel-page, Requirement: Даты, гости и номера
describe('RoomList', () => {
  it('without dates shows per-night prices and "Выберите даты"', () => {
    render(<RoomList hotel={hotel} stay={null} guests={guests} onPickDates={noop} />)
    expect(screen.queryByRole('link', { name: /Выбрать/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Выберите даты' })).toHaveLength(hotel.rooms.length)
    expect(screen.getAllByText('за ночь')).toHaveLength(hotel.rooms.length)
  })

  it('with dates links every room to the rates with the stay', () => {
    render(<RoomList hotel={hotel} stay={stay} guests={guests} onPickDates={noop} />)
    const link = screen.getAllByRole('link', { name: /Выбрать/ })[0]
    const url = new URL(link.getAttribute('href')!, 'http://x')
    expect(url.pathname).toBe(`/hotels/${hotel.id}/rooms`)
    expect(url.searchParams.get('checkin')).toBe(stay.checkIn)
    expect(url.searchParams.get('adults')).toBe('2')
    expect(url.hash).toBe(`#${room.id}`)
  })
})

// rate-selection
describe('RoomRates', () => {
  it('links "Забронировать" to an offer that parses back', () => {
    render(<RoomRates hotel={hotel} room={room} stay={stay} guests={guests} onPickDates={noop} />)
    const links = screen.getAllByRole('link', { name: 'Забронировать' })
    expect(links).toHaveLength(room.rates.length)
    const url = new URL(links[0].getAttribute('href')!, 'http://x')
    expect(url.pathname).toBe('/booking')
    const result = parseOffer(url.searchParams, future(0), [hotel], destinations)
    expect(result.ok && [result.offer.hotelId, result.offer.roomId, result.offer.rateId]).toEqual([
      hotel.id,
      room.id,
      room.rates[0].id,
    ])
  })

  it('without dates offers "Выберите даты" instead', () => {
    render(<RoomRates hotel={hotel} room={room} stay={null} guests={guests} onPickDates={noop} />)
    expect(screen.queryByRole('link', { name: 'Забронировать' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Выберите даты' })).toHaveLength(room.rates.length)
  })

  it('marks a room too small for the guests unavailable', () => {
    const three = { adults: 3, children: 0, rooms: 1 }
    render(<RoomRates hotel={hotel} room={room} stay={{ ...stay, guests: three }} guests={three} onPickDates={noop} />)
    expect(screen.getByText('Недоступен: Вмещает до 2 гостей')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Забронировать' })).toBeNull()
  })

  it('shows a free cancellation date and a non-refundable rate', () => {
    const rates = hotel.rooms.flatMap((r) => r.rates)
    const free = rates.find((r) => r.cancellation.kind === 'free')!
    const hard = rates.find((r) => r.cancellation.kind === 'non-refundable')!
    render(
      <RoomRates
        hotel={hotel}
        room={{ ...room, rates: [free, hard] }}
        stay={stay}
        guests={guests}
        onPickDates={noop}
      />,
    )
    const days = free.cancellation.kind === 'free' ? free.cancellation.daysBefore : 0
    // Stay starts in 10 days: a rate that cancels up to `days` before it is still free only if days <= 10.
    expect(screen.getAllByText(days <= 10 ? /^Бесплатная отмена до/ : /^Невозвратный тариф/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Невозвратный тариф').length).toBeGreaterThan(0)
  })
})

describe('a room without a rate', () => {
  const unpriced = { ...room, id: 'room-x', name: 'Номер без тарифа', capacity: 0, rates: [] }
  const real = { ...hotel, rooms: [room, unpriced] }

  it('says there is no price and offers nothing to pick', () => {
    render(<RoomList hotel={real} stay={stay} guests={guests} onPickDates={noop} />)
    expect(screen.getByText('Нет цены на выбранные даты')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Выбрать/ })).toHaveLength(1)
  })

  it('has no button to pick dates either', () => {
    render(<RoomList hotel={real} stay={null} guests={guests} onPickDates={noop} />)
    expect(screen.getAllByRole('button', { name: 'Выберите даты' })).toHaveLength(1)
    expect(screen.getByText('Нет цены на выбранные даты')).toBeTruthy()
  })

  it('has no rates to book on the rates page', () => {
    render(<RoomRates hotel={real} room={unpriced} stay={stay} guests={guests} onPickDates={noop} />)
    expect(screen.getByText('Нет цены на выбранные даты')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Забронировать' })).toBeNull()
  })
})
