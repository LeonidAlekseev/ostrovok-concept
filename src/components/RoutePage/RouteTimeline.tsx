'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import {
  BedDouble,
  Bus,
  Car,
  CarTaxiFront,
  ChevronDown,
  DoorOpen,
  Flag,
  Footprints,
  MapPin,
  Minus,
  Plus,
  Ticket,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatShortDay } from '@/lib/dates'
import { countRu, formatDecimal, formatPrice } from '@/lib/format'
import {
  formatTime,
  itemKey,
  itemTitle,
  TRANSFER_LABEL,
  TRANSFER_MODES,
  type PlanItem,
  type PlanStay,
  type RoutePlan,
  type TransferChoice,
  type TransferMode,
} from '@/lib/routes'
import { MAX_NIGHTS } from '@/lib/search'
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

interface Props {
  plan: RoutePlan
  /** The route's own transfers, which «Вернуть трансфер» brings back. */
  defaults: readonly TransferChoice[]
  transfers: readonly TransferChoice[]
  onNights: (stop: number, nights: number) => void
  onTransfer: (leg: number, mode: TransferChoice) => void
}

/** The door-to-door plan by day: arrival, transfers, check-ins and check-outs, leisure and departure. */
export function RouteTimeline({ plan, defaults, transfers, onNights, onTransfer }: Props) {
  // A removed transfer leaves a way back where it ran: after the arrival or the check-out it followed.
  const removedAfter = (item: PlanItem) => {
    const leg = item.kind === 'arrival' ? 0 : item.kind === 'check-out' ? item.stop + 1 : -1
    return leg >= 0 && transfers[leg] === 'none' ? leg : null
  }
  return (
    <ol aria-label="План по дням" className="flex flex-col gap-6">
      {plan.days.map((day) => (
        <li key={day.date} className="flex flex-col gap-3">
          <h3 className="text-lg font-bold">
            День {day.day} <span className="font-normal text-muted-foreground">· {formatShortDay(day.date)}</span>
          </h3>
          <ol className="flex flex-col gap-2 border-l-2 border-border pl-4">
            {day.items.map((item) => {
              const removed = removedAfter(item)
              return (
                <Fragment key={itemKey(item)}>
                  <li data-kind={item.kind}>
                    {item.kind === 'transfer' ? (
                      <TransferNode item={item} onChange={(mode) => onTransfer(item.leg, mode)} />
                    ) : (
                      <PlanNode
                        item={item}
                        stay={item.kind === 'check-in' ? plan.stays[item.stop] : undefined}
                        onNights={onNights}
                      />
                    )}
                  </li>
                  {removed !== null && (
                    <li>
                      <Button variant="ghost" size="sm" onClick={() => onTransfer(removed, defaults[removed])}>
                        <Undo2 aria-hidden /> Вернуть трансфер
                      </Button>
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ol>
        </li>
      ))}
    </ol>
  )
}

function Time({ item }: { item: PlanItem }) {
  return <span className="w-12 shrink-0 pt-0.5 font-semibold tabular-nums">{formatTime(item.start)}</span>
}

function PlanNode({
  item,
  stay,
  onNights,
}: {
  item: Exclude<PlanItem, { kind: 'transfer' }>
  stay?: PlanStay
  onNights: (stop: number, nights: number) => void
}) {
  const Icon = ITEM_ICON[item.kind]
  return (
    <div className="flex gap-3 py-1.5">
      <Time item={item} />
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {item.kind === 'check-in' || item.kind === 'check-out' ? (
            <p>
              {item.kind === 'check-in' ? 'Заезд: ' : 'Выезд: '}
              <Link
                href={hotelHref(item.hotel.id, stay ?? null)}
                className="font-semibold text-primary hover:underline"
              >
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
                Доп. услуга · {item.leisure.price ? formatPrice(item.leisure.price) : 'бесплатно'}
              </Badge>
            </>
          )}
        </div>
        {stay && <NightsStepper stay={stay} onNights={onNights} />}
      </div>
    </div>
  )
}

/** Plus and minus nights of a stop, at least 1; the check-out, the next stops and the price move with them. */
function NightsStepper({ stay, onNights }: { stay: PlanStay; onNights: (stop: number, nights: number) => void }) {
  const label = countRu(stay.nights, ['ночь', 'ночи', 'ночей'])
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="group" aria-label={`Ночей в ${stay.hotel.name}`} className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Минус ночь"
          disabled={stay.nights <= 1}
          onClick={() => onNights(stay.stop, stay.nights - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <output aria-live="polite" className="min-w-20 text-center font-semibold">
          {label}
        </output>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Плюс ночь"
          disabled={stay.nights >= MAX_NIGHTS}
          onClick={() => onNights(stay.stop, stay.nights + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      <span className="text-sm text-muted-foreground">
        до {formatShortDay(stay.checkOut)} · {formatPrice(stay.price)}
      </span>
    </div>
  )
}

/** A transfer stands out: its mode, time and price, and a menu to change the mode or remove it from the plan. */
function TransferNode({
  item,
  onChange,
}: {
  item: Extract<PlanItem, { kind: 'transfer' }>
  onChange: (mode: TransferChoice) => void
}) {
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
        <div className="flex items-center gap-2">
          <span className={cn('font-bold whitespace-nowrap', item.mode === 'car' && 'text-sm font-semibold')}>
            {item.mode === 'car' ? 'в аренде' : formatPrice(item.price)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              Изменить <ChevronDown aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label={`Способ: ${item.from} → ${item.to}`}>
              <DropdownMenuRadioGroup value={item.mode} onValueChange={(mode) => onChange(mode as TransferMode)}>
                {TRANSFER_MODES.map((mode) => {
                  const ModeIcon = TRANSFER_ICON[mode]
                  return (
                    <DropdownMenuRadioItem key={mode} value={mode} closeOnClick>
                      <ModeIcon aria-hidden /> {TRANSFER_LABEL[mode]}
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onChange('none')}>
                <Trash2 aria-hidden /> Убрать из плана
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
