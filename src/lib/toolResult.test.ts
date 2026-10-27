import { describe, expect, it } from 'vitest'
import {
  MAX_RESULT_BYTES,
  RESULT_CUT,
  errorResult,
  fitResult,
  isSafeUrl,
  jsonBytes,
  parseToolRun,
  toolResultSchema,
  type ToolResult,
} from './toolResult'
import { RUN_ID, sampleResult } from '@/test/toolResult'

// assistant-search, Requirement: Контракт результата инструмента
describe('the contract of a tool result', () => {
  it('takes a result of the contract', () => {
    expect(toolResultSchema.safeParse(sampleResult).success).toBe(true)
    expect(parseToolRun({ id: RUN_ID, result: sampleResult })).toEqual({ id: RUN_ID, result: sampleResult })
  })

  it('wants the error of an error result, and none of a success', () => {
    expect(toolResultSchema.safeParse(errorResult('store_unavailable', 'Хранилище недоступно')).success).toBe(true)
    expect(toolResultSchema.safeParse({ ...sampleResult, status: 'error' }).success).toBe(false)
    expect(toolResultSchema.safeParse({ ...sampleResult, error: { code: 'x', message: 'сбой' } }).success).toBe(false)
  })

  it('takes no claim citing a source the result does not have: the sources are the tool’s only', () => {
    const made = { ...sampleResult.claims[0], evidence_ids: ['invented-by-a-model'] }
    expect(toolResultSchema.safeParse({ ...sampleResult, claims: [made] }).success).toBe(false)
    const calculated = { ...sampleResult.claims[1], calculation_id: 'unknown' }
    expect(toolResultSchema.safeParse({ ...sampleResult, claims: [calculated] }).success).toBe(false)
  })

  it('takes only http(s) links', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'нет ссылки'])
      expect(isSafeUrl(url)).toBe(false)
    expect(isSafeUrl('https://www.openstreetmap.org/node/1')).toBe(true)
    const evidence = [{ ...sampleResult.evidence[0], source_url: 'javascript:alert(1)' }, sampleResult.evidence[1]]
    expect(toolResultSchema.safeParse({ ...sampleResult, evidence }).success).toBe(false)
  })

  it('takes a result with no sources: an empty list, not a made-up one (Scenario: Источников нет)', () => {
    const empty = { ...sampleResult, evidence: [], claims: [], calculations: [] }
    expect(toolResultSchema.safeParse(empty).success).toBe(true)
  })

  it('reads a run off the contract as none', () => {
    expect(parseToolRun(undefined)).toBeUndefined()
    expect(parseToolRun({ id: 'not-a-uuid', result: sampleResult })).toBeUndefined()
    expect(parseToolRun({ id: RUN_ID, result: { ...sampleResult, status: 'done' } })).toBeUndefined()
    expect(parseToolRun({ id: RUN_ID, result: { ...sampleResult, evidence: 'EEA' } })).toBeUndefined()
  })

  it('keeps a result within its share of the message’s 100 KB and says what was cut', () => {
    expect(fitResult(sampleResult)).toBe(sampleResult)
    const long = 'ш'.repeat(1000)
    const big: ToolResult = {
      ...sampleResult,
      evidence: Array.from({ length: 40 }, (_, i) => ({ ...sampleResult.evidence[1], id: `e${i}`, excerpt: long })),
      claims: Array.from({ length: 60 }, (_, i) => ({
        ...sampleResult.claims[0],
        id: `c${i}`,
        label: long.slice(0, 300),
        value: long.slice(0, 500),
        evidence_ids: [`e${i % 40}`],
      })),
    }
    expect(toolResultSchema.safeParse(big).success).toBe(true)
    const fitted = fitResult(big, 20_000)
    expect(jsonBytes(fitted)).toBeLessThanOrEqual(20_000)
    expect(fitted.limitations).toContain(RESULT_CUT)
    expect(toolResultSchema.safeParse(fitted).success).toBe(true)
    expect(jsonBytes(fitResult(big))).toBeLessThanOrEqual(MAX_RESULT_BYTES)
  })
})
