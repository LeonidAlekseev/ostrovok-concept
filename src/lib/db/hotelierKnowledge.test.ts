import { describe, expect, it, vi } from 'vitest'
import { dedupeKey, factText } from './hotelierKnowledge'

vi.mock('../supabase/config', () => ({ isSupabaseConfigured: false, supabaseUrl: '' }))

describe('the hotel’s knowledge from the hotelier', () => {
  it('words each fact from the characteristic itself, as the hotelier’s', () => {
    expect(
      factText({ key: 'room.window_side', value: 'на запад', yes: null, room: 'Deluxe', statement: 'Окна на запад.' }),
    ).toBe('Со слов отельера, номера Deluxe: сторона окон — на запад.')
    expect(factText({ key: 'hotel.parking', value: 'есть, платная', yes: null, room: null, statement: '' })).toBe(
      'Со слов отельера: парковка — есть, платная.',
    )
  })

  it('keys a question as `create_hotelier_request` does: the same words and characteristics in any order', () => {
    // The value `select encode(sha256(convert_to(concat_ws(E'\n', 'ota-1', lower('есть ли балкон?'),
    // 'room.balcony,room.floors', ''), 'UTF8')), 'hex')` gives on the database.
    const key = 'b390d8aa923794fff90adea477d6883f6e27125c6fff8ddcdf078433a41390c2'
    expect(dedupeKey('ota-1', '  Есть ли   балкон? ', ['room.floors', 'room.balcony'])).toBe(key)
  })
})
