import { Separator } from '@/components/ui/separator'
import { countRu, formatPrice } from '@/lib/format'
import { TRANSFER_LABEL, type RoutePlan } from '@/lib/routes'
import { RepeatRouteLink } from './RepeatRouteLink'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold whitespace-nowrap">{value ? `≈ ${formatPrice(value)}` : 'бесплатно'}</dd>
    </div>
  )
}

/**
 * The estimate of the route at weekday prices: main costs (hotels, transfers, rented car) and, apart,
 * extra services (leisure). The exact price comes with a copy of the route once its dates are chosen.
 */
export function RouteSummary({ routeId, plan }: { routeId: string; plan: RoutePlan }) {
  const transfers = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === 'transfer' ? item : [])))
  const leisure = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === 'leisure' ? item : [])))
  const nights = countRu(plan.nights, nightForms)
  return (
    <section
      aria-labelledby="route-price"
      className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-(--shadow-card)"
    >
      <div className="flex flex-col gap-1">
        <h2 id="route-price" className="text-heading font-bold">
          Сколько стоит
        </h2>
        <p className="text-sm text-muted-foreground">
          Примерно, по будним ценам, 2 взрослых. Точная цена — после выбора дат в копии маршрута.
        </p>
      </div>
      <dl aria-label="Основные" className="flex flex-col gap-1.5">
        {plan.stays.map((stay) => (
          <Row key={stay.stop} label={`${stay.hotel.name}, ${countRu(stay.nights, nightForms)}`} value={stay.price} />
        ))}
        {transfers
          .filter((item) => item.mode !== 'car')
          .map((item) => (
            <Row key={item.leg} label={`${TRANSFER_LABEL[item.mode]}: ${item.from} → ${item.to}`} value={item.price} />
          ))}
        {plan.carRental && (
          <Row
            label={`Аренда машины, ${countRu(plan.carRental.days, ['сутки', 'суток', 'суток'])}`}
            value={plan.carRental.price}
          />
        )}
        <div className="flex justify-between gap-3 pt-1 text-lg font-bold">
          <dt>Основные</dt>
          <dd data-testid="route-main" className="text-right">
            ≈ {formatPrice(plan.main)} <span className="text-sm font-semibold whitespace-nowrap">за {nights}</span>
          </dd>
        </div>
      </dl>
      <Separator />
      <dl aria-label="Доп. услуги" className="flex flex-col gap-1.5">
        {leisure.map((item) => (
          <Row key={item.index} label={item.leisure.title} value={item.leisure.price} />
        ))}
        <div className="flex justify-between gap-3 pt-1 font-bold">
          <dt>Доп. услуги</dt>
          <dd data-testid="route-extras" className="whitespace-nowrap">
            ≈ {formatPrice(plan.extras)}
          </dd>
        </div>
        <p className="text-sm text-muted-foreground">Досуг оплачивается отдельно и не входит в основные.</p>
      </dl>
      <RepeatRouteLink routeId={routeId} />
    </section>
  )
}
