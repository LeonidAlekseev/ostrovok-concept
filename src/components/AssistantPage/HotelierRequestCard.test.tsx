import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolResult, ToolRun } from '../../lib/toolResult'
import { ToolRunCard } from './ChatCards'

const realtime = vi.hoisted(() => ({
  row: null as object | null,
  update: null as null | ((payload: object) => void),
  removed: 0,
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    realtime: { setAuth: async () => {} },
    channel: () => {
      const channel = {
        on: (_type: string, _filter: object, handler: (payload: object) => void) => (
          (realtime.update = handler),
          channel
        ),
        subscribe: () => channel,
      }
      return channel
    },
    removeChannel: async () => void (realtime.removed += 1),
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: realtime.row, error: null }),
      }
      return query
    },
  }),
}))

const RUN = '00000000-0000-4000-8000-0000000001a1'
const step = { agent: 'hotelier', title: 'Запрос отельеру', params: 'Балкон в номере' }
const asked = {
  request_id: 'r1',
  hotel_name: 'L&H Gran Via',
  question: 'Есть ли балкон в номерах Deluxe?',
  requested_characteristics: ['room.balcony'],
}
const result = (status: ToolResult['status'], data: object, extra: Partial<ToolResult> = {}): ToolResult => ({
  status,
  summary: '',
  data: { ...asked, ...data },
  evidence: [],
  claims: [],
  calculations: [],
  method: null,
  limitations: [],
  error: null,
  ...extra,
})
const pending: ToolRun = { id: RUN, result: result('pending', { request_status: 'pending' }) }
const answered = result(
  'success',
  { request_status: 'answered', answer: 'Да, на 4–5 этажах.', knowledge: 'done' },
  {
    evidence: [
      {
        id: 'e1',
        source_type: 'hotelier',
        source_name: 'Отельер',
        source_id: null,
        source_url: null,
        title: 'Ответ отельера',
        excerpt: 'Со слов отельера, номера Deluxe: балкон в номере — есть.',
        retrieved_at: '2026-10-28T10:00:00Z',
        entity_id: null,
        claim_id: null,
        demo: true,
      },
    ],
    claims: [
      {
        id: 'c1',
        label: 'Балкон в номере (Deluxe)',
        value: 'да',
        status: 'reported',
        confidence: 0.75,
        evidence_ids: ['e1'],
        calculation_id: null,
        demo: true,
      },
    ],
  },
)

beforeEach(() => {
  realtime.row = null
  realtime.update = null
  realtime.removed = 0
})

// hotelier-knowledge, Requirement: Блок «Запрос отельеру»
describe('the block «Запрос отельеру»', () => {
  it('shows the hotel, the question and the characteristics while it waits', () => {
    render(<ToolRunCard step={step} run={pending} />)
    const card = screen.getByRole('region', { name: 'Запрос отельеру' })
    expect(within(card).getByRole('status').textContent).toBe('Ждёт ответа отельера')
    expect(within(card).getByText('L&H Gran Via')).toBeDefined()
    expect(within(card).getByText('Есть ли балкон в номерах Deluxe?')).toBeDefined()
    expect(
      within(within(card).getByRole('list', { name: 'Запрашиваемые характеристики' })).getByText('Балкон в номере'),
    ).toBeDefined()
  })

  it('takes the answer from `tool_runs` after a reload, and by Realtime as it comes', async () => {
    realtime.row = { id: RUN, result_data: answered }
    const { unmount } = render(<ToolRunCard step={step} run={pending} />)
    const card = screen.getByRole('region', { name: 'Запрос отельеру' })
    await waitFor(() => expect(within(card).getByRole('status').textContent).toBe('Отельер ответил'))
    expect(within(card).getByText('Да, на 4–5 этажах.')).toBeDefined()
    const facts = within(card).getByRole('list', { name: 'Извлечённые характеристики' })
    expect(facts.textContent).toContain('Балкон в номере (Deluxe): да')
    expect(facts.textContent).toContain('демо')
    expect(facts.textContent).toContain('уверенность 75 %')
    unmount()
    // Done: nothing to follow.
    expect(realtime.removed).toBe(1)

    realtime.row = null
    render(<ToolRunCard step={step} run={pending} />)
    await waitFor(() => expect(realtime.update).not.toBeNull())
    act(() => realtime.update!({ new: { id: RUN, result_data: answered }, errors: null }))
    expect(screen.getByRole('status').textContent).toBe('Отельер ответил')
  })

  it('ignores an event the policies refused', async () => {
    render(<ToolRunCard step={step} run={pending} />)
    await waitFor(() => expect(realtime.update).not.toBeNull())
    act(() => realtime.update!({ new: {}, errors: ['Error 401: Unauthorized'] }))
    expect(screen.getByRole('status').textContent).toBe('Ждёт ответа отельера')
  })
})
