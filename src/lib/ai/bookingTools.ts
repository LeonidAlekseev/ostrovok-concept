import { cancellationLabel } from '../booking'
import { MEAL_LABEL, PAYMENT_LABEL, findRate, findRoom, isSyntheticHotel, type Hotel } from '../catalog'
import { addDays, formatDateRange, formatLongDate, nightsBetween, weekday, type IsoDate } from '../dates'
import { countRu, formatPrice, guestsLabel } from '../format'
import { nightPrice } from '../offer'
import {
  MAX_CLAIMS,
  errorResult,
  fitResult,
  type ToolCalculation,
  type ToolClaim,
  type ToolEvidence,
  type ToolGroup,
  type ToolResult,
} from '../toolResult'
import {
  STATUS_LABEL,
  cancellationFee,
  feeLabel,
  quoteDateChange,
  tripTab,
  type DateChange,
  type TripBooking,
} from '../trips'

/**
 * The tools of the chat about the bookings (docs/tools.md): «Бронирования» reads the traveller's bookings with their
 * hotel, room and rate from the catalogue; «Пересчёт при смене дат» counts the price of the booked rate on new dates as
 * the checkout does and the cancellation terms they get. The bookings come from the browser with the request: what
 * they say is the booking's own record (`reported`, no source); the only sources are the catalogue's hotel and rate.
 * No names, contacts or card ever reach the tools, and nothing of a booking is stored but the run of a signed-in user.
 */

export const BOOKINGS_TOOL = 'booking_details'
export const BOOKINGS_TOOL_TITLE = 'Бронирования'
export const DATE_CHANGE_TOOL = 'booking_date_change'
export const DATE_CHANGE_TOOL_TITLE = 'Пересчёт при смене дат'

/** The bookings shown in full at most: each has its 8 characteristics within `MAX_CLAIMS`. */
export const MAX_DETAILED = 6

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

const BOOKING_RECORD = 'Данные брони — из этого браузера: сервер их не хранит и не сверяет с отелем'

/** «10–12 ноября 2026, 2 ночи». */
export const stayLabel = (checkIn: IsoDate, checkOut: IsoDate) =>
  `${formatDateRange(checkIn, checkOut)}, ${countRu(nightsBetween(checkIn, checkOut), nightForms)}`

/** The source of the hotel and its rate: the Ostrovok page a real hotel came from, the made-up catalogue otherwise. */
function hotelSource(hotel: Hotel, title: string, id: string): ToolEvidence {
  const real = !isSyntheticHotel(hotel)
  return {
    id,
    source_type: real ? 'ota_page' : 'dataset',
    source_name: real ? 'Островок' : 'Демо-каталог',
    source_id: hotel.id,
    source_url: null,
    title,
    excerpt: null,
    retrieved_at: null,
    entity_id: hotel.id,
    claim_id: null,
  }
}

/** The booked room and rate of the catalogue; `undefined` once they left it. */
function bookedRate(booking: TripBooking, hotel: Hotel | undefined) {
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  return room && rate ? { room, rate } : undefined
}

/** The characteristics of one booking, its sources and the calculation of what cancelling today withholds. */
function bookingClaims(booking: TripBooking, hotel: Hotel | undefined, today: IsoDate) {
  const evidence: ToolEvidence[] = []
  const claims: ToolClaim[] = []
  const calculations: ToolCalculation[] = []
  const key = booking.id
  const hotelEvidence = hotel ? hotelSource(hotel, `${hotel.name}: страница отеля`, `${key}:hotel`) : undefined
  const booked = bookedRate(booking, hotel)
  const rateEvidence =
    hotel && booked ? hotelSource(hotel, `${hotel.name}: ${booked.room.name}, тариф`, `${key}:rate`) : undefined
  if (hotelEvidence) evidence.push(hotelEvidence)
  if (rateEvidence) evidence.push(rateEvidence)
  const claim = (id: string, label: string, value: string, from?: ToolEvidence, calculation?: string) =>
    claims.push({
      id: `${key}:${id}`,
      label,
      value,
      status: calculation ? 'derived' : 'reported',
      confidence: null,
      evidence_ids: from ? [from.id] : [],
      calculation_id: calculation ?? null,
    })
  const tab = tripTab(booking, today)
  claim('status', 'Статус', STATUS_LABEL[tab])
  claim('hotel', 'Отель', hotel ? `${hotel.name}, ${hotel.address}` : 'отеля больше нет в каталоге', hotelEvidence)
  claim('dates', 'Даты', stayLabel(booking.checkIn, booking.checkOut))
  if (hotel)
    claim('times', 'Заезд и выезд', `заезд с ${hotel.checkInTime}, выезд до ${hotel.checkOutTime}`, hotelEvidence)
  claim(
    'room',
    'Номер и тариф',
    booked
      ? `${booked.room.name}; ${MEAL_LABEL[booked.rate.meal].toLocaleLowerCase('ru')}; ${PAYMENT_LABEL[booking.payment].toLocaleLowerCase('ru')}`
      : `тарифа брони больше нет в каталоге; ${PAYMENT_LABEL[booking.payment].toLocaleLowerCase('ru')}`,
    rateEvidence,
  )
  claim('guests', 'Гости', guestsLabel(booking.guests))
  claim('total', 'Сумма', formatPrice(booking.total))
  claim('cancellation', 'Условия отмены', cancellationLabel(booking.cancellation, booking.checkIn, { short: true }))
  if (booking.status === 'cancelled') {
    claim('fee', 'Удержано при отмене', formatPrice(booking.cancellationFee ?? 0))
  } else if (tab === 'upcoming') {
    const id = `${key}:fee-calc`
    calculations.push({
      id,
      name: 'Удержание при отмене сегодня',
      version: '1',
      inputs: [
        { label: 'Сегодня', value: formatLongDate(today) },
        { label: 'Условия отмены', value: cancellationLabel(booking.cancellation, booking.checkIn, { short: true }) },
        { label: 'Сумма брони', value: formatPrice(booking.total) },
      ],
      assumptions: [
        'До даты бесплатной отмены включительно — 0 ₽',
        'После неё — стоимость первой ночи по тарифу брони',
        'Невозвратный тариф — вся сумма',
      ],
    })
    claim('fee', 'Если отменить сегодня', feeLabel(cancellationFee(booking, today, hotel)), rateEvidence, id)
  }
  return { evidence, claims, calculations }
}

/**
 * «Бронирования»: the bookings asked of, each with its hotel, dates, room and rate, guests, total and cancellation
 * terms, and what cancelling today withholds; the upcoming first. Never throws.
 */
export function runBookingsTool(
  bookings: readonly TripBooking[],
  hotels: ReadonlyMap<string, Hotel>,
  today: IsoDate,
): ToolResult {
  if (bookings.length === 0)
    return {
      status: 'success',
      summary: 'Бронирований в этом браузере нет',
      data: { bookings: [] },
      evidence: [],
      claims: [],
      calculations: [],
      method: null,
      limitations: [BOOKING_RECORD],
      error: null,
    }
  const order = { upcoming: 0, past: 1, cancelled: 2 } as const
  const sorted = [...bookings].sort(
    (a, b) => order[tripTab(a, today)] - order[tripTab(b, today)] || a.checkIn.localeCompare(b.checkIn),
  )
  const shown = sorted.slice(0, MAX_DETAILED)
  const evidence: ToolEvidence[] = []
  const claims: ToolClaim[] = []
  const calculations: ToolCalculation[] = []
  const groups: ToolGroup[] = []
  for (const booking of shown) {
    const hotel = hotels.get(booking.hotelId)
    const part = bookingClaims(booking, hotel, today)
    evidence.push(...part.evidence)
    claims.push(...part.claims.slice(0, MAX_CLAIMS - claims.length))
    calculations.push(...part.calculations)
    groups.push({
      id: booking.id,
      title: `${booking.id} · ${hotel?.name ?? 'Отель'}`,
      note: `${STATUS_LABEL[tripTab(booking, today)].toLocaleLowerCase('ru')}, ${stayLabel(booking.checkIn, booking.checkOut)}`,
      claim_ids: part.claims.map((c) => c.id).filter((id) => claims.some((c) => c.id === id)),
    })
  }
  const one = shown.length === 1 ? shown[0] : undefined
  return fitResult({
    status: 'success',
    summary: one
      ? `${one.id}: ${hotels.get(one.hotelId)?.name ?? 'отель'}, ${stayLabel(one.checkIn, one.checkOut)}, ${formatPrice(one.total)}`
      : `Бронирований: ${bookings.length}, показаны ${shown.length}`,
    data: { bookings: shown.map((b) => b.id) },
    evidence,
    claims,
    calculations: calculations.slice(0, 10),
    method: null,
    limitations: [
      BOOKING_RECORD,
      ...(sorted.length > shown.length ? [`Показаны ${shown.length} из ${sorted.length} бронирований`] : []),
    ],
    error: null,
    ...(groups.length > 1 && { groups }),
  })
}

/** The nights of a stay by their price: the weekday ones and the Friday and Saturday ones. */
function nightsByPrice(checkIn: IsoDate, checkOut: IsoDate) {
  let weekend = 0
  for (let date = checkIn; date < checkOut; date = addDays(date, 1)) if ([5, 6].includes(weekday(date))) weekend += 1
  return { weekend, weekday: nightsBetween(checkIn, checkOut) - weekend }
}

/**
 * «Пересчёт при смене дат»: the booking on the new dates at the price of its rate in the catalogue now, with the
 * cancellation terms the new check-in gets — the change the traveller confirms (`data.change`). A booking that cannot
 * move, dates the search would not take or a rate gone from the catalogue are an error said in Russian. Never throws.
 */
export function runDateChangeTool(
  booking: TripBooking,
  hotel: Hotel | undefined,
  checkIn: IsoDate,
  checkOut: IsoDate,
  today: IsoDate,
): ToolResult {
  const quote = quoteDateChange(booking, hotel, checkIn, checkOut, today)
  if (!quote.ok) return errorResult('date_change_impossible', quote.error, { limitations: [BOOKING_RECORD] })
  const { change } = quote
  const booked = bookedRate(booking, hotel)!
  const source = hotelSource(hotel!, `${hotel!.name}: ${booked.room.name}, тариф`, `${booking.id}:rate`)
  const nights = nightsByPrice(checkIn, checkOut)
  const priceCalc: ToolCalculation = {
    id: `${booking.id}:price`,
    name: 'Цена проживания, как при бронировании',
    version: '1',
    inputs: [
      { label: 'Цена ночи тарифа (вс–чт)', value: formatPrice(booked.rate.pricePerNight) },
      {
        label: 'Цена ночи пт и сб',
        value: formatPrice(nightPrice(booked.rate.pricePerNight, nextWeekend(checkIn))),
      },
      { label: 'Ночей вс–чт', value: String(nights.weekday) },
      { label: 'Ночей пт и сб', value: String(nights.weekend) },
      { label: 'Номеров', value: String(booking.guests.rooms) },
    ],
    assumptions: [
      'Ночи пятницы и субботы на 15% дороже, с округлением вверх до 100 ₽',
      'Цена тарифа — из каталога сейчас, как в форме бронирования',
    ],
  }
  const termsCalc: ToolCalculation = {
    id: `${booking.id}:terms`,
    name: 'Условия отмены на новые даты',
    version: '1',
    inputs: [
      { label: 'Условия тарифа', value: cancellationLabel(booked.rate.cancellation, null) },
      { label: 'Новый заезд', value: formatLongDate(checkIn) },
    ],
    assumptions: ['Если срок бесплатной отмены на новые даты уже прошёл, тариф становится невозвратным'],
  }
  const difference = change.total - booking.total
  const claim = (id: string, label: string, value: string, extra: Partial<ToolClaim> = {}): ToolClaim => ({
    id: `${booking.id}:${id}`,
    label,
    value,
    status: 'reported',
    confidence: null,
    evidence_ids: [],
    calculation_id: null,
    ...extra,
  })
  const derived = (calculation: string): Partial<ToolClaim> => ({
    status: 'derived',
    evidence_ids: [source.id],
    calculation_id: calculation,
  })
  return fitResult({
    status: 'success',
    summary: `${booking.id}: ${stayLabel(checkIn, checkOut)} — ${formatPrice(change.total)}`,
    data: { change: change satisfies DateChange },
    evidence: [source],
    claims: [
      claim('was', 'Сейчас', `${stayLabel(booking.checkIn, booking.checkOut)}, ${formatPrice(booking.total)}`),
      claim('dates', 'Новые даты', stayLabel(checkIn, checkOut)),
      claim('total', 'Новая цена', formatPrice(change.total), derived(priceCalc.id)),
      claim(
        'difference',
        'Разница',
        difference === 0
          ? 'без доплаты'
          : `${difference > 0 ? 'доплата' : 'меньше на'} ${formatPrice(Math.abs(difference))}`,
        derived(priceCalc.id),
      ),
      claim(
        'cancellation',
        'Условия отмены',
        cancellationLabel(change.cancellation, checkIn, { short: true }),
        derived(termsCalc.id),
      ),
    ],
    calculations: [priceCalc, termsCalc],
    method: null,
    limitations: [
      BOOKING_RECORD,
      'Наличие номеров на новые даты не проверяется',
      'Даты меняются только после «Подтвердить»',
    ],
    error: null,
  })
}

/** The first Friday on or after `date`: the weekend price of the rate shown even for a stay without one. */
function nextWeekend(date: IsoDate): IsoDate {
  let day = date
  while (weekday(day) !== 5) day = addDays(day, 1)
  return day
}
