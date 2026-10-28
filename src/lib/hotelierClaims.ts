import type { HotelClaim } from './db/claims'
import { characteristicLabel, keyOfProperty } from './hotelierFacts'
import type { ToolClaim, ToolEvidence } from './toolResult'

/**
 * The hotelier's characteristics of the store (`hotelier.*` claims, `reported`) as Эвал and the blocks say them. No
 * `server-only`: the types only.
 */

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/** The value of a claim in words: «да», «нет», «4», the text. */
export function claimValueText(claim: Pick<HotelClaim, 'value' | 'unit'>): string {
  const { value, unit } = claim
  const text =
    value.kind === 'boolean'
      ? value.value
        ? 'да'
        : 'нет'
      : value.kind === 'number'
        ? String(value.value)
        : value.kind === 'text'
          ? value.value
          : value.kind === 'range'
            ? `${value.min ?? '…'}–${value.max ?? '…'}`
            : JSON.stringify(value.value)
  return unit ? `${text} ${unit}` : text
}

/** The room a claim is of, as the hotelier named it (`method.room`). */
export const claimRoom = (claim: Pick<HotelClaim, 'method'>): string | null =>
  typeof claim.method.room === 'string' && claim.method.room ? claim.method.room : null

/** «Балкон в номере (Deluxe)». */
export function hotelierClaimLabel(claim: Pick<HotelClaim, 'property' | 'method'>): string {
  const key = keyOfProperty(claim.property)
  const room = claimRoom(claim)
  return `${key ? characteristicLabel(key) : claim.property}${room ? ` (${room})` : ''}`
}

/**
 * The line of the model's facts: «Балкон в номере (Deluxe): да — по словам отельера, 28 октября», with [демо] for the
 * demonstration data and [противоречие] for an answer another answer contradicts.
 */
export function hotelierClaimLine(claim: HotelClaim, conflict = false): string {
  const when = claim.observedAt ? `, ${dayFormat.format(new Date(claim.observedAt))}` : ''
  const marks = `${claim.demo ? ' [демо]' : ''}${conflict ? ' [противоречие]' : ''}`
  return `${hotelierClaimLabel(claim)}: ${claimValueText(claim)} — по словам отельера${when}${marks}`
}

/** «демо», as the answers name the demonstration data. */
const DEMO_WORD = /(?<!\p{L})демо/iu

/**
 * What an answer that used the hotelier's characteristics must say whatever the model wrote: that they are the demo's
 * when they are, and that the hotelier's answers contradict each other when they do. Nothing when the answer does not
 * speak of the hotelier.
 */
export function hotelierNotes(answer: string, claims: readonly HotelClaim[]): string[] {
  if (claims.length === 0 || !/отельер/iu.test(answer)) return []
  return [
    claims.some((c) => c.demo) &&
      !DEMO_WORD.test(answer) &&
      'Сведения отельера здесь — демонстрационные (демо), не настоящий ответ отеля.',
    conflictingIds(claims).size > 0 &&
      !/расход|противореч/iu.test(answer) &&
      'Ответы отельера об этом расходятся: уточните у отеля перед бронированием.',
  ].filter((line): line is string => Boolean(line))
}

/** A hotelier's claim of the store for a block: its source is the answer it came from. */
export function hotelierToolClaim(claim: HotelClaim): ToolClaim {
  return {
    id: claim.id,
    label: hotelierClaimLabel(claim),
    value: claimValueText(claim).slice(0, 500),
    status: claim.status,
    confidence: claim.confidence,
    evidence_ids: claim.evidence.map((e) => e.id),
    calculation_id: null,
    ...(claim.demo && { demo: true }),
  }
}

/** The answer a hotelier's claim rests on, for a block. */
export function hotelierToolEvidence(claim: HotelClaim): ToolEvidence[] {
  return claim.evidence.map((e) => ({
    id: e.id,
    source_type: 'hotelier' as const,
    source_name: e.provider,
    source_id: null,
    source_url: null,
    title: e.title,
    excerpt: e.excerpt?.slice(0, 1000) ?? null,
    retrieved_at: e.retrievedAt,
    entity_id: null,
    claim_id: claim.id,
    ...(e.demo && { demo: true }),
  }))
}

/**
 * The hotelier's current answers that contradict each other: two claims of one characteristic and room with different
 * values. The ids of all of them.
 */
export function conflictingIds(
  claims: readonly Pick<HotelClaim, 'id' | 'property' | 'method' | 'value'>[],
): Set<string> {
  const groups = new Map<string, Pick<HotelClaim, 'id' | 'value'>[]>()
  for (const claim of claims) {
    const key = `${claim.property}:${claimRoom(claim)?.toLocaleLowerCase('ru') ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), claim])
  }
  const ids = new Set<string>()
  for (const group of groups.values())
    if (new Set(group.map((c) => JSON.stringify(c.value))).size > 1) for (const c of group) ids.add(c.id)
  return ids
}
