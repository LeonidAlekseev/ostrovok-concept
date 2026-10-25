import { LogIn, LogOut } from 'lucide-react'
import type { Hotel } from '@/lib/catalog'

/** "Правила": the hotel's check-in and check-out times. */
export function HotelRules({ hotel }: { hotel: Hotel }) {
  const rules = [
    { label: 'Заезд', value: `с ${hotel.checkInTime}`, Icon: LogIn },
    { label: 'Выезд', value: `до ${hotel.checkOutTime}`, Icon: LogOut },
  ]
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
    </section>
  )
}
