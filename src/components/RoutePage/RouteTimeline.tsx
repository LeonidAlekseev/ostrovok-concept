import Link from 'next/link'
import {
  BedDouble,
  Bus,
  Car,
  CarTaxiFront,
  DoorOpen,
  Flag,
  Footprints,
  MapPin,
  Ticket,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { countRu, formatDecimal, formatPrice } from '@/lib/format'
import {
  formatTime,
  itemKey,
  itemTitle,
  TRANSFER_LABEL,
  type PlanItem,
  type PlanStay,
  type RoutePlan,
  type TransferMode,
} from '@/lib/routes'
import { hotelHref } from './hotelHref'

const TRANSFER_ICON: Record<TransferMode, LucideIcon> = {
  transfer: Bus,
  taxi: CarTaxiFront,
  car: Car,
  walk: Footprints,
}

const ITEM_ICON: Record<Exclude<PlanItem['kind'], 'transfer'>, LucideIcon> = {
  arrival: MapPin,
  departure: Flag,
  'check-in': BedDouble,
  'check-out': DoorOpen,
  leisure: Ticket,
}

/**
 * The door-to-door plan by relative day («День 1», «День 2»…): arrival, transfers, check-ins and
 * check-outs, leisure and departure, with their times and estimated prices; no calendar dates.
 */
export function RouteTimeline({ plan }: { plan: RoutePlan }) {
  return (
    <ol aria-label="План по дням" className="flex flex-col gap-6">
      {plan.days.map((day) => (
        <li key={day.day} className="flex flex-col gap-3">
          <h3 className="text-lg font-bold">День {day.day}</h3>
          <ol className="flex flex-col gap-2 border-l-2 border-border pl-4">
            {day.items.map((item) => (
              <li key={itemKey(item)} data-kind={item.kind}>
                {item.kind === 'transfer' ? (
                  <TransferNode item={item} />
                ) : (
                  <PlanNode item={item} stay={item.kind === 'check-in' ? plan.stays[item.stop] : undefined} />
                )}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

function Time({ item }: { item: PlanItem }) {
  return <span className="w-12 shrink-0 pt-0.5 font-semibold tabular-nums">{formatTime(item.start)}</span>
}

function PlanNode({ item, stay }: { item: Exclude<PlanItem, { kind: 'transfer' }>; stay?: PlanStay }) {
  const Icon = ITEM_ICON[item.kind]
  return (
    <div className="flex gap-3 py-1.5">
      <Time item={item} />
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {item.kind === 'check-in' || item.kind === 'check-out' ? (
            <p>
              {item.kind === 'check-in' ? 'Заезд: ' : 'Выезд: '}
              <Link href={hotelHref(item.hotel.id)} className="font-semibold text-primary hover:underline">
                {item.hotel.name}
              </Link>
            </p>
          ) : (
            <p className="font-semibold">{itemTitle(item)}</p>
          )}
          {item.kind === 'leisure' && (
            <>
              <span className="text-sm text-muted-foreground">{item.leisure.category}</span>
              <Badge variant="secondary" className="ml-auto">
                Доп. услуга · {item.leisure.price ? `≈ ${formatPrice(item.leisure.price)}` : 'бесплатно'}
              </Badge>
            </>
          )}
        </div>
        {stay && (
          <p className="text-sm text-muted-foreground">
            {countRu(stay.nights, ['ночь', 'ночи', 'ночей'])} · ≈ {formatPrice(stay.price)}
          </p>
        )}
      </div>
    </div>
  )
}

/** A transfer stands out: its mode, time and price. */
function TransferNode({ item }: { item: Extract<PlanItem, { kind: 'transfer' }> }) {
  const Icon = TRANSFER_ICON[item.mode]
  const label = TRANSFER_LABEL[item.mode]
  return (
    <div
      role="group"
      aria-label={`${label}: ${item.from} → ${item.to}`}
      className="-ml-[25px] flex gap-3 rounded-xl border border-primary/30 bg-secondary px-3 py-2.5"
    >
      <Time item={item} />
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <p className="font-bold">{label}</p>
          <p className="text-sm text-muted-foreground">
            {item.from} → {item.to}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.minutes} мин · {formatDecimal(item.km)} км
          </p>
        </div>
        <span className="font-bold whitespace-nowrap">
          {item.mode === 'car' ? 'в аренде' : item.price ? `≈ ${formatPrice(item.price)}` : formatPrice(0)}
        </span>
      </div>
    </div>
  )
}
