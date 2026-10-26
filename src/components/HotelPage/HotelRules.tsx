import { LogIn, LogOut } from 'lucide-react'
import type { Hotel } from '@/lib/catalog'
import type { HotelDetails } from '@/lib/hotelDetails'

/**
 * "Правила": the hotel's check-in and check-out times; a real hotel's page adds its paid services and fees and the
 * hotel's notes for the guests, as Ostrovok gives them.
 */
export function HotelRules({ hotel, details }: { hotel: Hotel; details?: HotelDetails | null }) {
  const rules = [
    { label: 'Заезд', value: `с ${hotel.checkInTime}`, Icon: LogIn },
    { label: 'Выезд', value: `до ${hotel.checkOutTime}`, Icon: LogOut },
  ]
  const policies = details?.policies ?? []
  const notes = details?.notes
  return (
    <section id="rules" tabIndex={-1} aria-labelledby="rules-title" className="flex flex-col gap-4 outline-none">
      <h2 id="rules-title" className="text-heading font-bold">
        Правила
      </h2>
      <dl className="grid max-w-md grid-cols-2 gap-4">
        {rules.map(({ label, value, Icon }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon className="size-6 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
            <div className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-lg/tight font-bold">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {policies.length > 0 && (
        <section aria-labelledby="rules-paid-title" className="flex max-w-3xl flex-col gap-2">
          <h3 id="rules-paid-title" className="font-bold">
            Дополнительные услуги и сборы
          </h3>
          <dl className="flex flex-col divide-y divide-border rounded-xl bg-card px-4 shadow-(--shadow-card)">
            {policies.map(({ label, value }) => (
              <div key={`${label}-${value}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                <dt>{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {notes && (
        <section aria-labelledby="rules-notes-title" className="flex max-w-3xl flex-col gap-2">
          <h3 id="rules-notes-title" className="font-bold">
            Примечания отеля
          </h3>
          <p className="whitespace-pre-line">{notes}</p>
        </section>
      )}
      {(policies.length > 0 || notes) && <p className="text-sm text-muted-foreground">По данным Островка.</p>}
    </section>
  )
}
