import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/database.types'
import { toolResultSchema } from '../toolResult'
import { runAskHotelier } from './hotelierTool'

const RUN = '00000000-0000-4000-8000-0000000001a1'
const CHAT = '00000000-0000-4000-8000-00000000c0a1'
const USER = '00000000-0000-4000-8000-0000000000a1'
const traveller = { userId: USER, chatId: CHAT, runId: RUN }

const client = (answer: { data: unknown; error: { code: string; message: string } | null }) => {
  const rpc = vi.fn(async () => answer)
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

const input = {
  hotelId: 'ota-1',
  question: 'Есть ли балкон в номерах Deluxe?',
  characteristicKeys: ['room.balcony' as const],
}

describe('«Запрос отельеру»', () => {
  it('leaves the question for the hotelier by the server for the traveller, linked to the chat and the run: pending, not an error', async () => {
    const { client: db, rpc } = client({ data: [{ request: 'r1', conversation: 'c1', reused: false }], error: null })
    const result = await runAskHotelier(db, input, { hotelName: 'Hotel', traveller })
    expect(rpc).toHaveBeenCalledWith('create_hotelier_request', {
      traveller: USER,
      hotel_id: 'ota-1',
      question: 'Есть ли балкон в номерах Deluxe?',
      origin_chat_id: CHAT,
      origin_tool_run_id: RUN,
      characteristic_keys: ['room.balcony'],
    })
    expect(toolResultSchema.parse(result)).toMatchObject({
      status: 'pending',
      error: null,
      evidence: [],
      data: {
        request_id: 'r1',
        hotel_id: 'ota-1',
        request_status: 'pending',
        requested_characteristics: ['room.balcony'],
      },
    })
    expect(result.limitations).toContain('Спрошено: Балкон в номере')
  })

  it('says an identical open question waits already', async () => {
    const { client: db } = client({ data: [{ request: 'r1', conversation: 'c1', reused: true }], error: null })
    const result = await runAskHotelier(db, input, { hotelName: 'Hotel', traveller })
    expect(result.summary).toBe('Этот вопрос уже ждёт ответа отельера «Hotel»')
  })

  it.each([
    ['hotelier_request_limit', 'rate_limited'],
    ['hotelier_request_invalid', 'invalid_request'],
    ['boom', 'store_unavailable'],
  ])('turns the database’s %s into the error %s', async (message, code) => {
    const { client: db } = client({ data: null, error: { code: 'P0001', message } })
    const result = await runAskHotelier(db, input, { hotelName: 'Hotel', traveller })
    expect(result).toMatchObject({ status: 'error', error: { code } })
  })

  it('asks nothing for a guest, without the run of the tool or the service role, or for a question off the contract', async () => {
    const { client: db, rpc } = client({ data: null, error: null })
    expect(await runAskHotelier(db, input, { hotelName: 'Hotel', traveller: null })).toMatchObject({
      error: { code: 'sign_in_required' },
    })
    expect(
      await runAskHotelier(db, input, { hotelName: 'Hotel', traveller: { ...traveller, runId: null } }),
    ).toMatchObject({ error: { code: 'store_unavailable' } })
    expect(await runAskHotelier(null, input, { hotelName: 'Hotel', traveller })).toMatchObject({
      error: { code: 'store_unavailable' },
    })
    const long = { ...input, question: 'а'.repeat(501) }
    expect(await runAskHotelier(db, long, { hotelName: 'Hotel', traveller })).toMatchObject({
      error: { code: 'invalid_request' },
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
