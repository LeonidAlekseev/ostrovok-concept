import { describe, expect, it } from 'vitest'
import { CONFIDENCE_RULES, SOURCE_CONFIDENCE, confidenceOf, confidenceFor } from './confidence'

// hotel-knowledge, Requirement: Политика уверенности
describe('confidenceOf', () => {
  it('is never above the least confident input', () => {
    for (const rule of Object.values(CONFIDENCE_RULES))
      expect(confidenceOf(rule)).toBeLessThanOrEqual(Math.min(...rule.inputs.map((s) => SOURCE_CONFIDENCE[s])))
    expect(confidenceOf({ inputs: ['osm', 'review'], assumptions: [] })).toBe(0.75)
  })

  it('goes down with each assumption and never below 0', () => {
    expect(confidenceOf({ inputs: ['eea'], assumptions: ['evening_equals_day'] })).toBe(0.85)
    expect(confidenceOf({ inputs: ['eea'], assumptions: ['evening_equals_day', 'day_not_quieter_than_night'] })).toBe(
      0.8,
    )
    expect(confidenceOf({ inputs: ['model'], assumptions: Array(9).fill('osm_complete') })).toBe(0)
    expect(() => confidenceOf({ inputs: [], assumptions: [] })).toThrow()
  })

  it('names the policy and the rule', () => {
    expect(confidenceFor('osm_count')).toEqual({
      confidence: 0.9,
      method: { policy: 'confidence-1', rule: 'osm_count' },
    })
  })
})
