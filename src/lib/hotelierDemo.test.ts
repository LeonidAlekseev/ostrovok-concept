import { describe, expect, it } from 'vitest'
import { HOTELIER_KEYS } from './hotelierFacts'
import { DEMO_CONVERSATIONS, DEMO_HOTELS, demoId } from './hotelierDemo'

const messages = DEMO_CONVERSATIONS.flatMap((c) => c.messages)
const requests = DEMO_CONVERSATIONS.flatMap((c) => c.requests)

// hotelier-demo, Requirement: Демо-набор переписок
describe('the demo of the chats with the hoteliers', () => {
  it('derives the same UUID v5 from a key on every run, a different one for another key', () => {
    expect(demoId('zenit-1')).toBe(demoId('zenit-1'))
    expect(demoId('zenit-1')).not.toBe(demoId('zenit-2'))
    expect(demoId('zenit-1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('has every key once, so no row is written twice', () => {
    const keys = [
      ...DEMO_CONVERSATIONS.map((c) => c.key),
      ...messages.map((m) => m.key),
      ...requests.map((r) => r.key),
      ...DEMO_CONVERSATIONS.flatMap((c) => (c.evalChat ? [c.evalChat.key] : [])),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('plays 5–8 real hotels of Valencia', () => {
    const hotels = new Set(DEMO_CONVERSATIONS.map((c) => c.hotelId))
    expect(hotels.size).toBeGreaterThanOrEqual(5)
    expect(hotels.size).toBeLessThanOrEqual(8)
    for (const id of hotels) expect(id).toMatch(/^ota-\d+$/)
    expect([...hotels].sort()).toEqual(Object.values(DEMO_HOTELS).sort())
  })

  it('has the known, the unknown, the contradicting, the guaranteed and the private', () => {
    // Known: the assistant answers from a shareable answer's facts.
    expect(messages.some((m) => m.sourcesOf && messages.find((s) => s.key === m.sourcesOf)?.facts?.length)).toBe(true)
    // Unknown: a request of Эвал no hotelier answered.
    const answered = new Set(messages.filter((m) => m.sender === 'hotelier' && m.request).map((m) => m.request))
    expect(
      DEMO_CONVERSATIONS.some((c) => c.kind === 'ai_request' && c.requests.some((r) => !answered.has(r.key))),
    ).toBe(true)
    // Contradicting: a later answer stands beside the earlier one.
    expect(messages.some((m) => m.conflict && m.facts?.length)).toBe(true)
    // The hotelier's answer that is not for the common knowledge.
    expect(messages.some((m) => m.sender === 'hotelier' && !m.shareable)).toBe(true)
    // Passed to the hotelier: the assistant's message of a request in a traveller's chat.
    expect(DEMO_CONVERSATIONS.some((c) => c.kind === 'user' && c.status === 'waiting_hotelier')).toBe(true)
  })

  it('covers the balconies, the windows, the noise, the views and where the rooms are', () => {
    const keys = new Set([
      ...messages.flatMap((m) => m.facts ?? []).map((f) => f.key),
      ...requests.flatMap((r) => r.keys),
    ])
    for (const key of ['room.balcony', 'room.window_side', 'room.noise', 'room.view', 'room.location', 'room.floors'])
      expect(keys).toContain(key)
    for (const key of keys) expect(HOTELIER_KEYS).toContain(key)
  })

  it('links every message to a request of its conversation, in time order, with Эвал’s chats for its requests', () => {
    for (const conversation of DEMO_CONVERSATIONS) {
      const own = new Set(conversation.requests.map((r) => r.key))
      for (const m of conversation.messages) if (m.request) expect(own).toContain(m.request)
      const times = conversation.messages.map((m) => m.at)
      expect(times).toEqual([...times].sort())
      if (conversation.evalChat) expect(conversation.kind).toBe('ai_request')
      // The facts are the hotelier's, of a shareable answer only.
      for (const m of conversation.messages) if (m.facts) expect(m.sender === 'hotelier' && m.shareable).toBe(true)
    }
  })
})
