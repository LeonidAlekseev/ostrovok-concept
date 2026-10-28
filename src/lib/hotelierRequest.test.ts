import { describe, expect, it } from 'vitest'
import { isOpenRequest, requestStage, requestViewOf } from './hotelierRequest'
import type { ToolResult } from './toolResult'

const result = (status: ToolResult['status'], data: Record<string, unknown> | null): ToolResult => ({
  status,
  summary: '',
  data,
  evidence: [],
  claims: [],
  calculations: [],
  method: null,
  limitations: [],
  error: status === 'error' ? { code: 'x', message: 'x' } : null,
})

describe('the block «Запрос отельеру»', () => {
  it('reads a waiting request and its answer later', () => {
    const asked = {
      request_id: 'r1',
      hotel_name: 'Hotel',
      question: 'Балкон?',
      requested_characteristics: ['room.balcony', 1],
    }
    const pending = requestViewOf(result('pending', { ...asked, request_status: 'pending' }))!
    expect(pending).toMatchObject({ status: 'pending', keys: ['room.balcony'], answer: null })
    expect(isOpenRequest(pending)).toBe(true)
    const answered = requestViewOf(result('success', { ...asked, answer: 'Да', knowledge: 'queued' }))!
    expect(answered).toMatchObject({ status: 'answered', answer: 'Да', knowledge: 'queued' })
    expect(isOpenRequest(answered)).toBe(true)
    expect(isOpenRequest({ ...answered, knowledge: 'done' })).toBe(false)
    // Withdrawn by the hotelier: the last stage, which no older copy of the block replaces.
    const revoked = requestViewOf(result('success', { ...asked, answer: 'Да', knowledge: 'revoked' }))!
    expect(revoked.knowledge).toBe('revoked')
    expect(isOpenRequest(revoked)).toBe(false)
    expect([pending, answered, { ...answered, knowledge: 'done' as const }, revoked, null].map(requestStage)).toEqual([
      0, 1, 2, 3, -1,
    ])
  })

  it('is none for another tool’s result', () => {
    expect(requestViewOf(result('success', { level: 55 }))).toBeNull()
    expect(requestViewOf(result('success', null))).toBeNull()
  })
})
