'use client'

import type { Hotel } from '@/lib/catalog'
import { nightsBetween, todayIso } from '@/lib/dates'
import { countRu } from '@/lib/format'
import { guruPrice, lowestPrice } from '@/lib/offer'
import { useHotelStay } from './stayContext'

/** The price of the page's stay: the hotel's lowest, or without dates one night, the cheapest of the next 7 days. */
export function useStayPrice(hotel: Hotel) {
  const { stay, guests } = useHotelStay()
  const price = lowestPrice(hotel, stay, guests.rooms, todayIso())
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 1
  return {
    price,
    guru: guruPrice(price),
    caption: `за ${countRu(nights, ['ночь', 'ночи', 'ночей'])} для ${countRu(guests.adults + guests.children, ['гостя', 'гостей', 'гостей'])}`,
  }
}
