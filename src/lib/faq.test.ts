import { describe, expect, it } from 'vitest'
import { faq, faqCategories } from '@/data/faq'
import { filterFaq } from './faq'

describe('faq data', () => {
  it('has 16–24 questions with unique ids, all in known categories', () => {
    expect(faq.length).toBeGreaterThanOrEqual(16)
    expect(faq.length).toBeLessThanOrEqual(24)
    expect(new Set(faq.map((q) => q.id)).size).toBe(faq.length)
    const ids = faqCategories.map((c) => c.id)
    expect(faq.every((q) => ids.includes(q.category))).toBe(true)
    expect(ids.every((id) => faq.some((q) => q.category === id))).toBe(true)
  })
})

describe('filterFaq', () => {
  it('returns everything for an empty query', () => {
    expect(filterFaq('  ')).toEqual(faq)
  })

  it('matches the question or the answer, ignoring case', () => {
    const found = filterFaq('ОТМЕН')
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((q) => /отмен/i.test(q.question + q.answer))).toBe(true)
  })

  it('treats «ё» and «е» alike', () => {
    const items = [{ id: 'a', category: 'booking' as const, question: 'Ёлка', answer: 'вперёд' }]
    expect(filterFaq('елка', items)).toHaveLength(1)
    expect(filterFaq('ВПЕРЕД', items)).toHaveLength(1)
  })

  it('returns nothing when nothing matches', () => {
    expect(filterFaq('qwertyzzz')).toEqual([])
  })
})
