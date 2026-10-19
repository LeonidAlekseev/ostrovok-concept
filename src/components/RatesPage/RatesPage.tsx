import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { Hotel } from '@/lib/catalog'
import { RatesView } from './RatesView'

export function RatesPage({ hotel }: { hotel: Hotel }) {
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <header className="flex flex-col gap-2">
        <Link
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          href={`/hotels/${hotel.id}`}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {hotel.name}
        </Link>
        <h1 className="text-title font-bold tracking-[-0.02em]">Номера и тарифы</h1>
      </header>
      <RatesView hotel={hotel} />
      <section aria-labelledby="terms-title" className="flex flex-col gap-2 rounded-lg bg-muted p-4">
        <h2 id="terms-title" className="font-bold">
          Условия проживания
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>Заезд с {hotel.checkInTime}</li>
          <li>Выезд до {hotel.checkOutTime}</li>
          <li>Цены демонстрационные и включают налоги.</li>
        </ul>
      </section>
    </main>
  )
}
