'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { loadDestinations, loadHotels } from '@/lib/catalogSource'
import { todayIso } from '@/lib/dates'
import { parseOffer } from '@/lib/offer'
import { BookingForm } from './BookingForm'
import { OrderSummary } from './OrderSummary'

function Booking() {
  const params = useSearchParams()
  const result = parseOffer(params, todayIso(), loadHotels([params.get('hotel') ?? '']), loadDestinations())

  if (!result.ok) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-title font-bold tracking-[-0.02em]">{result.error}</h1>
        <p className="text-muted-foreground">Выберите отель и тариф заново.</p>
        <Link className={buttonVariants()} href="/#search">
          Найти отель
        </Link>
      </div>
    )
  }

  const { offer } = result
  // The form is keyed by the offer, so a changed address starts a fresh form.
  return (
    <>
      <h1 className="text-title font-bold tracking-[-0.02em]">Оформление бронирования</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <BookingForm key={params.toString()} offer={offer} />
        <div className="lg:sticky lg:top-24 lg:order-last max-lg:-order-1">
          <OrderSummary offer={offer} />
        </div>
      </div>
    </>
  )
}

/** `/booking`: the offer is read from the address on the client, the page itself is prerendered. */
export function BookingPage() {
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <Suspense fallback={<p className="text-muted-foreground">Загружаем предложение…</p>}>
        <Booking />
      </Suspense>
    </main>
  )
}
