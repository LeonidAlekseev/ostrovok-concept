'use client'

import { ArrowRight } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Hotel } from '@/lib/catalog'
import { nightsBetween, todayIso } from '../../lib/dates'
import { countRu, formatPrice } from '../../lib/format'
import { guruPrice, lowestPrice } from '../../lib/offer'
import { goToSection } from './goToSection'
import { useHotelStay } from './stayContext'

/**
 * The bar stuck to the bottom of the page or the hotel dialog: the hotel's lowest price for the stay,
 * struck out, its GURU price and "Выбрать номер", which leads to the rooms. Without dates the price
 * is one night, the cheapest of the check-ins in the next 7 days.
 */
export function PriceBar({ hotel, className }: { hotel: Hotel; className?: string }) {
  const { stay, guests } = useHotelStay()
  const price = lowestPrice(hotel, stay, guests.rooms, todayIso())
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 1
  const people = guests.adults + guests.children

  return (
    <div
      role="region"
      aria-label="Цена"
      className={cn('sticky bottom-0 z-10 flex items-center gap-3 bg-card shadow-(--shadow-card)', className)}
    >
      <div className="flex shrink-0 flex-col">
        <s className="text-sm/tight text-muted-foreground">
          <span className="sr-only">Обычная цена </span>
          {formatPrice(price)}
        </s>
        <p className="text-[clamp(22px,6vw,28px)]/tight font-bold whitespace-nowrap text-primary">
          <span className="sr-only">Цена GURU </span>
          {formatPrice(guruPrice(price))}
        </p>
        <p className="text-xs/tight whitespace-nowrap text-muted-foreground">
          за {countRu(nights, ['ночь', 'ночи', 'ночей'])}, для {countRu(people, ['гостя', 'гостей', 'гостей'])}
        </p>
      </div>
      <Button size="lg" className="h-12 min-w-0 flex-1 px-4 text-base" onClick={() => goToSection('rooms')}>
        <span className="min-w-0 flex-1 truncate text-center">Выбрать номер</span>
        <ArrowRight aria-hidden />
      </Button>
    </div>
  )
}
