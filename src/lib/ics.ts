import { addDays, type IsoDate } from './dates'

/**
 * An iCalendar file (RFC 5545) of local-time events: the calendar of an iPhone, Android or computer
 * imports it from the downloaded `.ics`. Times are floating, so the event stays at the same clock time
 * of the trip wherever the phone is; every event reminds a day and an hour before.
 */
export interface CalendarEvent {
  /** Unique within the file and stable across exports of the same plan. */
  uid: string
  date: IsoDate
  /** Minutes from midnight. */
  start: number
  minutes: number
  summary: string
  location?: string
  description?: string
}

const CRLF = '\r\n'
/** Content lines longer than this many octets are folded (RFC 5545 §3.1). */
const LINE_OCTETS = 75
const REMINDERS = ['-P1D', '-PT1H']

/** TEXT values escape the backslash, semicolon, comma and line breaks (RFC 5545 §3.3.11). */
export const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const encoder = new TextEncoder()

/** Splits a line into chunks of at most 75 octets, never inside a UTF-8 character; continuations start with a space. */
export function foldLine(line: string): string {
  const chunks: string[] = []
  let chunk = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // A continuation line spends one octet on its leading space.
    const limit = chunks.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1
    if (octets + size > limit) {
      chunks.push(chunk)
      chunk = ''
      octets = 0
    }
    chunk += char
    octets += size
  }
  chunks.push(chunk)
  return chunks.join(`${CRLF} `)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Floating local DATE-TIME: `20261105T143000`; minutes past midnight move to the next days. */
function localDateTime(date: IsoDate, minutes: number): string {
  const day = addDays(date, Math.floor(minutes / 1440))
  const time = minutes % 1440
  return `${day.replace(/-/g, '')}T${pad(Math.floor(time / 60))}${pad(time % 60)}00`
}

const utcStamp = (now: Date) =>
  now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

/** The whole `.ics` text: CRLF line ends, folded lines, a `VALARM` a day and an hour before each event. */
export function toIcs(calendarName: string, events: readonly CalendarEvent[], now: Date): string {
  const stamp = utcStamp(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//O!Pognali//Route plan//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localDateTime(event.date, event.start)}`,
      `DTEND:${localDateTime(event.date, event.start + event.minutes)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    )
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    for (const trigger of REMINDERS)
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(event.summary)}`,
        `TRIGGER:${trigger}`,
        'END:VALARM',
      )
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join(CRLF) + CRLF
}
