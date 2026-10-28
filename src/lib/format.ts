import type { Guests } from './search'

const priceFormat = new Intl.NumberFormat('ru-RU')

export function formatPrice(value: number): string {
  // Intl uses a narrow no-break space as the group separator; a regular
  // no-break space matches the reference typography.
  return `${priceFormat.format(value).replace(/ /g, ' ')} ₽`
}

/** One decimal with a decimal comma: 9.4 → "9,4"; guest rating, distance. */
export function formatDecimal(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/** «1,5 км от центра»: the distance of a hotel to the centre of its city. */
export function kmFromCentre(km: number): string {
  return `${formatDecimal(km)} км от центра`
}

/** «220 м», «1 км», «1,5 км»: a distance rounded to 10 m, from a kilometre in kilometres. */
export function formatMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} м`
  return `${formatDecimal(meters / 1000).replace(/,0$/, '')} км`
}

/** Russian plural form: pluralRu(2, ['гость', 'гостя', 'гостей']) → 'гостя'. */
export function pluralRu(n: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export function countRu(n: number, forms: [string, string, string]): string {
  return `${n} ${pluralRu(n, forms)}`
}

/** "2 гостя", "3 гостя, 2 номера". */
export function guestsLabel({ adults, children, rooms }: Guests): string {
  const guests = countRu(adults + children, ['гость', 'гостя', 'гостей'])
  return rooms > 1 ? `${guests}, ${countRu(rooms, ['номер', 'номера', 'номеров'])}` : guests
}

/**
 * A text cut to `max` characters at most without breaking a word: at the last space before the limit, with «…».
 * A plain `slice` leaves a fragment of a word («Superi»), which reads as the model's typo. A text without a space
 * near the limit is cut where it must be.
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max - 1)
  const space = head.search(/\s\S*$/u)
  const cut = space >= max * 0.6 ? head.slice(0, space) : head
  return `${cut.replace(/[\s,;:—–-]+$/u, '')}…`
}
