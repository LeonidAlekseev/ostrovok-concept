import { DEFAULT_GUESTS, setGuestParams } from '@/lib/search'

/** The hotel page without dates, for two adults in one room: the dates are chosen in a copy of the route. */
export const hotelHref = (hotelId: string) =>
  `/hotels/${hotelId}?${setGuestParams(new URLSearchParams(), DEFAULT_GUESTS)}`
