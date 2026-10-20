/** Dates are kept as local ISO day strings (YYYY-MM-DD) to avoid timezone drift. */
export type IsoDate = string

export function toIso(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromIso(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

export function nightsBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000)
}

/** Day of the week of `iso`, 0 for Sunday; computed in UTC so the browser time zone cannot shift it. */
export function weekday(iso: IsoDate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function todayIso(): IsoDate {
  return toIso(new Date())
}

const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short' })
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
export const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })

function monthLabel(date: Date): string {
  // "окт." — the short form already carries a trailing dot when abbreviated.
  return shortMonth.format(date)
}

const shortWeekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })

/** "24 окт, сб": the day, the short month without its dot and the short weekday. */
export function formatShortDay(iso: IsoDate): string {
  const date = fromIso(iso)
  return `${date.getDate()} ${monthLabel(date).replace('.', '')}, ${shortWeekday.format(date)}`
}

export function formatLongDate(iso: IsoDate): string {
  return longDate.format(fromIso(iso))
}

/** "17 – 18 окт. 2026 г.", "30 окт. – 2 нояб. 2026 г.", "30 дек. 2026 г. – 2 янв. 2027 г." */
export function formatDateRange(from: IsoDate, to: IsoDate | null): string {
  const a = fromIso(from)
  if (!to) return `${a.getDate()} ${monthLabel(a)} ${a.getFullYear()} г. – …`
  const b = fromIso(to)
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${monthLabel(a)} ${a.getFullYear()} г. – ${b.getDate()} ${monthLabel(b)} ${b.getFullYear()} г.`
  }
  const year = `${b.getFullYear()} г.`
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} ${monthLabel(a)} – ${b.getDate()} ${monthLabel(b)} ${year}`
  }
  return `${a.getDate()} – ${b.getDate()} ${monthLabel(b)} ${year}`
}

/** Monday-first grid of a month; `null` cells pad the first week. */
export function monthGrid(year: number, month: number): (IsoDate | null)[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (IsoDate | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= days; d++) cells.push(toIso(new Date(year, month, d)))
  return cells
}
