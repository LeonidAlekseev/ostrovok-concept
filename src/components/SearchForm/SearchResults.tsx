import { Info, LoaderCircle } from 'lucide-react'
import type { SearchStatus } from '../../hooks/useHotelSearch'
import { formatDateRange } from '../../lib/dates'
import { countRu, formatPrice, guestsLabel } from '../../lib/format'
import type { SearchResult } from '../../lib/search'
import styles from './SearchForm.module.css'

interface Props {
  status: SearchStatus
}

export function SearchResults({ status }: Props) {
  return (
    <div className={styles.results} aria-live="polite">
      {status.state === 'loading' && (
        <p className={styles.resultsLoading}>
          <LoaderCircle className={styles.spin} size={18} aria-hidden />
          Ищем варианты…
        </p>
      )}
      {status.state === 'error' && <p className={styles.error}>{status.message}</p>}
      {status.state === 'done' && <Done result={status.result} />}
    </div>
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
      <p className={styles.resultsTitle}>{title}</p>
      <p className={styles.resultsMeta}>
        {formatDateRange(query.checkIn, query.checkOut)} · {nights} · {guestsLabel(query.guests)}
      </p>
      <ul className={styles.resultsList}>
        {result.items.map(({ destination, totalFrom }) => (
          <li key={destination.id} className={styles.resultsItem}>
            <span>
              <span className={styles.optionLabel}>{destination.name}</span>
              <span className={styles.optionHint}>{destination.country}</span>
            </span>
            <span className={styles.resultsPrice}>
              от {formatPrice(totalFrom)}
              <span className={styles.optionHint}>за {nights}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.demoNote}>
        <Info size={16} aria-hidden />
        <span>
          Демо-режим: цены ориентировочные, бронирование не выполняется. Параметры запроса:{' '}
          <code>?{result.params.toString()}</code>
        </span>
      </p>
    </>
  )
}
