import { describe, expect, it } from 'vitest'
import { seedRoutes } from '../data/routes'
import type { Hotel } from './catalog'
import { getHotel } from './catalogGenerator'
import { escapeText, foldLine, toIcs, type CalendarEvent } from './ics'
import { buildPlan, defaultState, planEvents } from './routes'

interface Component {
  name: string
  props: Map<string, string[]>
  children: Component[]
}

/**
 * A strict reader of the RFC 5545 subset the export writes: CRLF line ends, at most 75 octets a line,
 * folding, balanced BEGIN/END, unescaped TEXT values. It throws on anything else.
 */
function parseIcs(text: string): Component {
  if (!text.endsWith('\r\n')) throw new Error('the file must end with CRLF')
  const physical = text.slice(0, -2).split('\r\n')
  for (const line of physical) {
    if (line.includes('\n') || line.includes('\r')) throw new Error(`bare line break in ${JSON.stringify(line)}`)
    const bytes = new TextEncoder().encode(line)
    if (bytes.length > 75) throw new Error(`line of ${bytes.length} octets`)
    // Folding never cuts a character: every physical line is valid UTF-8 on its own.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  const lines = physical.reduce<string[]>((all, line) => {
    if (line.startsWith(' ')) all[all.length - 1] += line.slice(1)
    else all.push(line)
    return all
  }, [])
  const stack: Component[] = [{ name: '', props: new Map(), children: [] }]
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 1) throw new Error(`no property name in ${JSON.stringify(line)}`)
    const [name, value] = [line.slice(0, colon), line.slice(colon + 1)]
    if (name === 'BEGIN') {
      const component = { name: value, props: new Map(), children: [] }
      stack.at(-1)!.children.push(component)
      stack.push(component)
    } else if (name === 'END') {
      if (stack.pop()?.name !== value) throw new Error(`END:${value} does not close its BEGIN`)
    } else {
      if (/[;,]/.test(value.replace(/\\[\\;,nN]/g, '')) && !/^(DTSTART|DTEND|DTSTAMP|TRIGGER|UID)$/.test(name))
        throw new Error(`unescaped character in ${name}`)
      const props = stack.at(-1)!.props
      props.set(name, [...(props.get(name) ?? []), value.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1')])
    }
  }
  if (stack.length !== 1) throw new Error('unclosed component')
  const [calendar] = stack[0].children
  if (stack[0].children.length !== 1 || calendar.name !== 'VCALENDAR') throw new Error('one VCALENDAR expected')
  return calendar
}

const one = (component: Component, name: string) => {
  const values = component.props.get(name)
  if (values?.length !== 1) throw new Error(`${component.name}: one ${name} expected, got ${values?.length ?? 0}`)
  return values[0]
}

const NOW = new Date('2026-10-22T09:15:42.123Z')
const event: CalendarEvent = {
  uid: 'r-1@opognali',
  date: '2026-11-03',
  start: 23 * 60 + 30,
  minutes: 60,
  summary: 'Концерт; орган, Бах\\Гендель\nвторое отделение',
  location: 'Прага, Мала Страна',
}

describe('the iCalendar text', () => {
  it('escapes TEXT values', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })

  it('folds long lines at 75 octets without cutting a character', () => {
    const line = `SUMMARY:${'Пражский Град '.repeat(12)}`
    const folded = foldLine(line)
    expect(folded.split('\r\n').length).toBeGreaterThan(1)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
    expect(foldLine('SHORT:value')).toBe('SHORT:value')
  })

  it('writes a valid calendar whose events remind a day and an hour before', () => {
    const calendar = parseIcs(toIcs('План: Прага', [event], NOW))
    expect(one(calendar, 'VERSION')).toBe('2.0')
    expect(one(calendar, 'PRODID')).toMatch(/^-\/\//)
    expect(one(calendar, 'X-WR-CALNAME')).toBe('План: Прага')
    const [vevent] = calendar.children
    expect(vevent.name).toBe('VEVENT')
    expect(one(vevent, 'UID')).toBe('r-1@opognali')
    expect(one(vevent, 'DTSTAMP')).toBe('20261022T091542Z')
    expect(one(vevent, 'DTSTART')).toBe('20261103T233000')
    // An event past midnight ends the next day.
    expect(one(vevent, 'DTEND')).toBe('20261104T003000')
    expect(one(vevent, 'SUMMARY')).toBe(event.summary)
    expect(one(vevent, 'LOCATION')).toBe(event.location)
    expect(vevent.children.map((alarm) => [alarm.name, one(alarm, 'ACTION'), one(alarm, 'TRIGGER')])).toEqual([
      ['VALARM', 'DISPLAY', '-P1D'],
      ['VALARM', 'DISPLAY', '-PT1H'],
    ])
    for (const alarm of vevent.children) expect(one(alarm, 'DESCRIPTION')).toBe(event.summary)
  })
})

// routes, Requirement: Экспорт в календарь
describe('the plan in the calendar', () => {
  const route = seedRoutes[0]
  const hotels: Record<string, Hotel> = Object.fromEntries(
    route.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!]),
  )

  it('has the arrival, check-ins, check-outs, transfers, leisure and departure, each with two alarms', () => {
    const state = {
      ...defaultState(route, '2026-11-02'),
      transfers: ['transfer' as const, 'walk' as const, 'none' as const],
    }
    const plan = buildPlan(route, hotels, state)
    const calendar = parseIcs(toIcs(route.title, planEvents(route, plan), NOW))
    const events = calendar.children
    expect(events.every((e) => e.name === 'VEVENT' && e.children.length === 2)).toBe(true)
    const summaries = events.map((e) => one(e, 'SUMMARY'))
    expect(summaries[0]).toBe('Прибытие: Аэропорт Вацлава Гавела')
    expect(summaries.at(-1)).toBe('Отъезд: Главный вокзал Праги')
    expect(summaries.filter((s) => s.startsWith('Заезд: '))).toHaveLength(2)
    expect(summaries.filter((s) => s.startsWith('Выезд: '))).toHaveLength(2)
    // The removed last transfer is not in the file; the walk is.
    expect(summaries.filter((s) => /^(Трансфер|Такси|Аренда машины|Пешком): /.test(s))).toEqual([
      `Трансфер: Аэропорт Вацлава Гавела → ${hotels['prague-mala-strana-residence'].name}`,
      `Пешком: ${hotels['prague-mala-strana-residence'].name} → ${hotels['prague-vltava-loft-rooms'].name}`,
    ])
    for (const leisure of route.leisure) expect(summaries).toContain(leisure.title)
    expect(new Set(events.map((e) => one(e, 'UID'))).size).toBe(events.length)
    expect(one(events[0], 'DTSTART')).toBe('20261103T123000')
  })
})
