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

/** The line of the model's facts: «Балкон в номере (Deluxe): да, на 4–5 этажах — по словам отельера, 28 октября». */
export function hotelierClaimLine(claim: HotelClaim): string {
  const when = claim.observedAt ? `, ${dayFormat.format(new Date(claim.observedAt))}` : ''
  return `${hotelierClaimLabel(claim)}: ${claimValueText(claim)} — по словам отельера${when}${claim.demo ? ' [демо]' : ''}`
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
