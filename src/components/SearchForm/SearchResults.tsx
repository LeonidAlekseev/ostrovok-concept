import { Info, LoaderCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { SearchStatus } from '@/hooks/useHotelSearch'
import { formatDateRange } from '../../lib/dates'
import { countRu, formatPrice, guestsLabel } from '../../lib/format'
import type { SearchResult } from '../../lib/search'

interface Props {
  status: SearchStatus
}

export function SearchResults({ status }: Props) {
  return (
    <Card className="mt-3.5 gap-0 rounded-none border-t px-1 pt-3.5 pb-0.5 empty:hidden" aria-live="polite">
      {status.state === 'loading' && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="animate-[spin_0.9s_linear_infinite]" size={18} aria-hidden />
          Ищем варианты…
        </p>
      )}
      {status.state === 'error' && <p className="m-0 text-sm text-destructive">{status.message}</p>}
      {status.state === 'done' && <Done result={status.result} />}
    </Card>
  )
}

function Done({ result }: { result: SearchResult }) {
  const { query } = result
  const title =
    result.target.kind === 'destination'
      ? `${result.target.destination.name}, ${result.target.destination.country}`
      : `${result.target.title}: ${countRu(result.items.length, ['направление', 'направления', 'направлений'])}`
  const nights = countRu(result.nights, ['ночь', 'ночи', 'ночей'])
  return (
    <>
      <p className="text-lg/[normal] font-[650]">{title}</p>
      <p className="mt-0.5 mb-2.5 text-sm/[normal] text-muted-foreground">
        {formatDateRange(query.checkIn, query.checkOut)} · {nights} · {guestsLabel(query.guests)}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {result.items.map(({ destination, totalFrom }) => (
          <li key={destination.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
            <span>
              <span className="block font-semibold">{destination.name}</span>
              <span className="block text-sm/[normal] font-normal text-muted-foreground">{destination.country}</span>
            </span>
            <span className="text-right font-[650] whitespace-nowrap">
              от {formatPrice(totalFrom)}
              <span className="block text-sm/[normal] font-normal text-muted-foreground">за {nights}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-2 text-sm/[1.45] text-muted-foreground">
        <Info className="mt-0.5 flex-none" size={16} aria-hidden />
        <span>
          Демо-режим: цены ориентировочные, бронирование не выполняется. Параметры запроса:{' '}
          <code className="break-all">?{result.params.toString()}</code>
        </span>
      </p>
    </>
  )
}
