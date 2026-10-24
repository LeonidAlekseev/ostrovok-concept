import { CircleCheck } from 'lucide-react'
import { cn } from 'cn'
import { guestReasons, type GuestReason, type Hotel } from '@/lib/catalog'
import { formatDecimal } from '@/lib/format'

const text = (reason: GuestReason) => {
  switch (reason.kind) {
    case 'rating':
      return `Высокая оценка гостей ${formatDecimal(reason.rating)}/10`
    case 'centre':
      return `Близко к центру — ${formatDecimal(reason.km)} км`
    case 'free-cancellation':
      return 'Бесплатная отмена'
  }
}

/** "Почему гости выбирают нас": only what the hotel's data says; nothing at all without a reason. */
export function WhyGuests({ hotel, className }: { hotel: Hotel; className?: string }) {
  const reasons = guestReasons(hotel)
  if (reasons.length === 0) return null
  return (
    <section aria-labelledby="why-title" className={cn('flex flex-col gap-3', className)}>
      <h2 id="why-title" className="text-lg font-bold">
        Почему гости выбирают нас
      </h2>
      <ul className="flex flex-col gap-2">
        {reasons.map((reason) => (
          <li key={reason.kind} className="flex items-center gap-2.5">
            <CircleCheck className="size-5 shrink-0 fill-success-foreground text-white" aria-hidden />
            {text(reason)}
          </li>
        ))}
      </ul>
    </section>
  )
}
