import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { MEAL_LABEL, PAYMENT_LABEL } from '@/lib/catalog'
import { cancellationLabel, effectiveCancellation } from '@/lib/booking'
import { formatDateRange, todayIso } from '@/lib/dates'
import { countRu, formatPrice, guestsLabel } from '@/lib/format'
import type { Offer } from '@/lib/offer'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

export function OrderSummary({ offer }: { offer: Offer }) {
  const { hotel, room, rate, nights } = offer
  return (
    <aside aria-labelledby="summary-title" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h2 id="summary-title" className="text-heading font-bold">
        Ваш заказ
      </h2>
      <div className="flex gap-3">
        <PhotoPlaceholder photo={room.photos[0]} kind="room" className="h-16 w-24 shrink-0 rounded-md" />
        <div>
          <p className="font-bold">{hotel.name}</p>
          <p className="text-sm text-muted-foreground">{offer.destination.name}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&_dd]:text-right">
        <dt className="text-muted-foreground">Номер</dt>
        <dd>{room.name}</dd>
        <dt className="text-muted-foreground">Тариф</dt>
        <dd>{MEAL_LABEL[rate.meal]}</dd>
        <dt className="text-muted-foreground">Даты</dt>
        <dd>
          {formatDateRange(offer.checkIn, offer.checkOut)}, {countRu(nights, nightForms)}
        </dd>
        <dt className="text-muted-foreground">Гости</dt>
        <dd>{guestsLabel(offer.guests)}</dd>
        <dt className="text-muted-foreground">Отмена</dt>
        <dd>{cancellationLabel(effectiveCancellation(rate, offer.checkIn, todayIso()), offer.checkIn)}</dd>
        <dt className="text-muted-foreground">Оплата</dt>
        <dd>{PAYMENT_LABEL[rate.payment]}</dd>
      </dl>
      <p className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="font-semibold">Итого</span>
        <b className="text-xl">{formatPrice(offer.total)}</b>
      </p>
    </aside>
  )
}
