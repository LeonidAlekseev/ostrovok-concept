import { describe, expect, it } from 'vitest'
import { VACATION_REPLY } from '@/lib/assistant'
import { POST } from './route'

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/assistant', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/assistant (standalone)', () => {
  it('answers every message with the vacation reply and keeps the brief', async () => {
    const brief = { destinationId: 'valencia', adults: 2 }
    const response = await post({ messages: [{ role: 'user', text: 'Найди тихий отель у моря' }], brief })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ brief, reply: VACATION_REPLY, source: 'rules' })
  })

  it('answers a question about a hotel the same way', async () => {
    const brief = { hotelId: 'ota-7481548' }
    const response = await post({ messages: [{ role: 'user', text: 'Шумно ли ночью?' }], brief })
    expect((await response.json()).reply).toBe('Извините, я в отпуске!)')
  })

  it('rejects a malformed request', async () => {
    expect((await post({ messages: 'нет' })).status).toBe(400)
  })
})
