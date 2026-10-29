/**
 * The budget the traveller names, in ₽. The rates are fixed here, in one place (not live): the assistant plans in
 * rubles and the numbers must be the same in the rules, in the model's answer and in the tests.
 */
export const RUB_PER_EUR = 90
export const RUB_PER_USD = 81

export type Currency = 'rub' | 'eur' | 'usd'

const RATE: Record<Currency, number> = { rub: 1, eur: RUB_PER_EUR, usd: RUB_PER_USD }

/** A sum in `currency` as whole ₽. */
export const toRub = (amount: number, currency: Currency) => Math.round(amount * RATE[currency])

/** What the traveller named: a sum in ₽ and whether it is for a night (`perNight`) or for the whole trip. */
export interface NamedBudget {
  rub: number
  perNight: boolean
}

/** The model's budget (the amount as said, its currency and period) as the same `NamedBudget` the rules give. */
export function budgetOf(amount: number | null | undefined, currency?: string | null, per?: string | null) {
  if (typeof amount !== 'number' || !(amount > 0)) return undefined
  const code: Currency = currency === 'eur' || currency === 'usd' ? currency : 'rub'
  return { rub: toRub(amount, code), perNight: per === 'night' } satisfies NamedBudget
}

const CURRENCY: [Currency, RegExp][] = [
  ['eur', /^(?:€|евро|eur)/],
  ['usd', /^(?:\$|доллар|долл|usd|бакс)/],
  ['rub', /^(?:₽|руб|р\.)/],
]
const currencyOf = (sign: string): Currency | undefined => CURRENCY.find(([, re]) => re.test(sign))?.[0]

// «150$», «€200», «50 тыс», «70к», «300 евро», «2 000 000 ₽»: a number, its thousands and its currency. Spaces join
// only the groups of three digits: the day, month and year of «10 11 2026» are three numbers, not one. Spaces join
// only the groups of three digits: the day, month and year of «10 11 2026» are three numbers, not one.
const AMOUNT =
  /(?:(€|\$)\s*)?(\d{1,3}(?:[\s ]\d{3})+(?!\d)|\d+)\s*(тыс[а-я.]*|к(?![а-яё]))?\s*(€|\$|евро|eur(?![a-z])|долл[а-я.]*|доллар[а-я]*|usd(?![a-z])|баксов|бакс[а-я]*|₽|руб[а-я.]*|р\.)?/g
// «за ночь», «в сутки», «в ночь», «150$/ночь».
const PER_NIGHT = /(?:за|в|на|\/)\s*(?:одну\s+)?(?:ночь|сутки|сут(?![а-яё]))|за\s+ночь/

/**
 * The budget the lowercase `text` names: the first sum with a currency or a thousands word, or a bare sum of 3000 and more
 * (as the rubles of the whole trip). Euros and dollars become ₽ by the fixed rates; «за ночь», «в сутки» make it a
 * night's sum. A number of nights or of days is not a budget.
 */
export function parseBudget(text: string): NamedBudget | undefined {
  for (const m of text.matchAll(AMOUNT)) {
    const value = Number(m[2].replace(/[\s ]/g, ''))
    const thousands = /^(?:тыс|к)/.test(m[3] ?? '')
    const currency = currencyOf(m[4] ?? m[1] ?? '')
    const amount = thousands ? value * 1000 : value
    if (!currency && !thousands && amount < 3000) continue
    return { rub: toRub(amount, currency ?? 'rub'), perNight: PER_NIGHT.test(text) }
  }
  return undefined
}
