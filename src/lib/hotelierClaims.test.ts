import { describe, expect, it } from 'vitest'
import type { HotelClaim } from './db/claims'
import { claimValueText, hotelierClaimLine, hotelierToolClaim } from './hotelierClaims'

const claim = (extra: Partial<HotelClaim> = {}): HotelClaim => ({
  id: 'c1',
  property: 'hotelier.room.balcony',
  sourceKey: 'hotelier:m1:deluxe',
  value: { kind: 'boolean', value: true },
  unit: null,
  status: 'reported',
  confidence: 0.75,
  method: { policy: 'confidence-1', rule: 'owner_answer', room: 'Deluxe' },
  observedAt: '2026-10-28T10:00:00Z',
  validFrom: null,
  validTo: null,
  limitations: [],
  calculation: null,
  evidence: [],
  ...extra,
})

describe('the hotelier’s characteristics', () => {
  it('say the value in words', () => {
    expect(claimValueText(claim())).toBe('да')
    expect(claimValueText(claim({ value: { kind: 'text', value: 'на запад' } }))).toBe('на запад')
    expect(claimValueText(claim({ value: { kind: 'number', value: 4 }, unit: 'м²' }))).toBe('4 м²')
  })

  it('are told to the model as the hotelier’s words, the demo ones marked', () => {
    expect(hotelierClaimLine(claim())).toBe('Балкон в номере (Deluxe): да — по словам отельера, 28 октября 2026 г.')
    expect(hotelierClaimLine(claim({ demo: true }))).toMatch(/\[демо\]$/)
  })

  it('keep the policy’s confidence and the demo mark in the block', () => {
    expect(hotelierToolClaim(claim({ demo: true }))).toMatchObject({
      label: 'Балкон в номере (Deluxe)',
      value: 'да',
      status: 'reported',
      confidence: 0.75,
      demo: true,
    })
    expect(hotelierToolClaim(claim())).not.toHaveProperty('demo')
  })
})
