import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { destinations } from '@/data/destinations'
import type { Brief } from '@/lib/assistant'
import { understandWish } from './understand'

const today = '2026-10-24'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}

/** The model's answer with the fields it left out as null, as the schema asks. */
const answer = (fields: Record<string, unknown>) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        destinationId: null,
        vibe: null,
        when: null,
        checkIn: null,
        checkOut: null,
        nights: null,
        party: null,
        mood: null,
        budget: null,
        reply: 'Записал!',
        ...fields,
      }),
    },
  ],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
})

/** Reads `text` after `brief` with a model that answers `fields`. */
function read(text: string, fields: Record<string, unknown>, brief: Brief = {}) {
  const model = new MockLanguageModelV4({ doGenerate: answer(fields) })
  return understandWish(model, { messages: [{ role: 'user', text }], brief }, today, destinations)
}

describe('understandWish: named days', () => {
  it('takes the days and the length of «с 10 по 15 ноября»', async () => {
    const { parsed } = await read('тихий отель в Валенсии с 10 по 15 ноября, вдвоём', {
      destinationId: 'valencia',
      checkIn: '2026-11-10',
      checkOut: '2026-11-15',
      party: 'couple',
    })
    expect(parsed).toEqual({
      destinationId: 'valencia',
      party: 'couple',
      dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' },
      when: 10,
      nights: 5,
    })
  })

  it('moves the check-in and keeps the length of the stay for «а с 12-го?»', async () => {
    const brief: Brief = {
      destinationId: 'valencia',
      party: 'couple',
      dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' },
      when: 10,
      nights: 5,
    }
    const { parsed } = await read('а с 12-го?', { checkIn: '2026-11-12' }, brief)
    expect(parsed).toEqual({ dates: { checkIn: '2026-11-12', checkOut: '2026-11-17' }, when: 10, nights: 5 })
  })

  it('moves the check-out of the stay for a new length of it', async () => {
    const brief: Brief = { dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' }, when: 10, nights: 5 }
    const { parsed } = await read('на 3 ночи', { nights: 3 }, brief)
    expect(parsed).toEqual({ dates: { checkIn: '2026-11-10', checkOut: '2026-11-13' }, when: 10, nights: 3 })
  })

  it('asks for the days when the named ones are past', async () => {
    const { parsed } = await read('в Валенсии с 10 по 15 октября', { checkIn: '2026-10-10', checkOut: '2026-10-15' })
    expect(parsed).toEqual({ datesRejected: true })
  })

  it('asks for the days when they are impossible or too long', async () => {
    expect((await read('с 31 февраля по 2 марта', { checkIn: '2027-02-31', checkOut: '2027-03-02' })).parsed).toEqual({
      datesRejected: true,
    })
    expect((await read('с 1 ноября по 1 января', { checkIn: '2026-11-01', checkOut: '2027-01-01' })).parsed).toEqual({
      datesRejected: true,
    })
  })

  it('asks for the days when only the check-in is named and the length is not known', async () => {
    const { parsed } = await read('с 12 ноября', { checkIn: '2026-11-12' })
    expect(parsed).toEqual({ datesRejected: true })
  })

  it('takes no days the message does not name', async () => {
    const { parsed } = await read('тихий отель в Валенсии, вдвоём', {
      destinationId: 'valencia',
      checkIn: '2026-11-10',
      checkOut: '2026-11-15',
      party: 'couple',
    })
    expect(parsed).toEqual({ destinationId: 'valencia', party: 'couple' })
  })
})
