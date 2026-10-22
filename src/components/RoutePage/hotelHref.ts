import { DEFAULT_GUESTS, setGuestParams, setStayParams } from '@/lib/search'

/** The hotel page with the dates of a stay of the plan, two adults in one room. */
export function hotelHref(hotelId: string, stay: { checkIn: string; checkOut: string } | null): string {
  const params = stay
    ? setStayParams(new URLSearchParams(), { checkIn: stay.checkIn, checkOut: stay.checkOut, guests: DEFAULT_GUESTS })
    : setGuestParams(new URLSearchParams(), DEFAULT_GUESTS)
  return `/hotels/${hotelId}?${params}`
}
