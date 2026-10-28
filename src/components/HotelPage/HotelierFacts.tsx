'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { HotelierFactView, HotelierFactsResponse } from '@/app/api/hotels/[hotelId]/hotelier/facts/schema'
import type { Hotel } from '@/lib/catalog'
import { DemoBadge } from '../DemoBadge'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

/** The characteristics of a real hotel by its hotelier's words, read fresh: `null` while read or when there are none. */
function useHotelierFacts(hotelId: string): HotelierFactView[] | null {
  const [facts, setFacts] = useState<HotelierFactView[] | null>(null)
  useEffect(() => {
    if (!hotelId.startsWith('ota-')) return
    let current = true
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/hotelier/facts`)
      .then((response) => (response.ok ? (response.json() as Promise<HotelierFactsResponse>) : null))
      .then((body) => current && setFacts(body?.facts ?? null))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [hotelId])
  return facts
}

function Fact({ fact }: { fact: HotelierFactView }) {
  const meta = [
    `по словам отельера${fact.observedAt ? `, ${dayFormat.format(new Date(fact.observedAt))}` : ''}`,
    fact.confidence !== null && `уверенность ${Math.round(fact.confidence * 100)} %`,
  ].filter(Boolean)
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          {fact.label}
          {fact.room && <span className="text-muted-foreground"> · {fact.room}</span>}
        </span>
        <span className="flex items-center gap-1.5 font-semibold">
          {fact.value}
          {fact.demo && <DemoBadge />}
        </span>
      </div>
      <span className="text-sm text-muted-foreground">{meta.join(' · ')}</span>
      {fact.conflict && (
        <Badge variant="destructive" className="w-fit">
          <TriangleAlert aria-hidden />
          Ответы отельера расходятся: уточняется
        </Badge>
      )}
    </li>
  )
}

/**
 * «Сведения отельера» on a real hotel's page: what the hotel's hotelier told the travellers and Эвал, as claims
 * `reported` of the store with their date and confidence; answers that contradict each other are marked, the
 * demonstration ones «демо». Nothing when the hotelier said nothing yet.
 */
export function HotelierFacts({ hotel }: { hotel: Hotel }) {
  const facts = useHotelierFacts(hotel.id)
  if (!facts?.length) return null
  return (
    <section id="hotelier" aria-labelledby="hotelier-title" className="flex flex-col gap-3">
      <h2 id="hotelier-title" className="text-heading font-bold">
        Сведения отельера
      </h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Отельер ответил на вопросы гостей и Эвала. Сервис это не проверял: уточняйте важное перед бронированием.
      </p>
      <ul
        aria-label="Сведения отельера"
        className="flex max-w-3xl flex-col divide-y divide-border rounded-xl bg-card px-4 shadow-(--shadow-card)"
      >
        {facts.map((fact) => (
          <Fact key={fact.id} fact={fact} />
        ))}
      </ul>
    </section>
  )
}
