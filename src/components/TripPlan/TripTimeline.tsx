'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  CalendarArrowDown,
  ChevronDown,
  EllipsisVertical,
  GripVertical,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
} from '@/lib/routes'
import { MAX_NIGHTS } from '@/lib/search'
import {
  dayLeisure,
  moveLeisure,
  moveLeisureToDay,
  removeLeisure,
  restoreTransfer,
  setLeisureTime,
  setNights,
  setTransfer,
  type TripData,
  type TripLeisure,
} from '@/lib/trip'
import { hotelHref } from '../RoutePage/hotelHref'
import { ITEM_ICON, TRANSFER_ICON } from '../RoutePage/planIcons'
import { Time } from '../RoutePage/RouteTimeline'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

/** The times a leisure item may start, every quarter of an hour, and its own time when off the grid. */
const QUARTERS = Array.from({ length: 96 }, (_, i) => formatTime(i * 15))
const timesWith = (time: string) => (QUARTERS.includes(time) ? QUARTERS : [...QUARTERS, time].sort())
const itemsForms: [string, string, string] = ['пункт', 'пункта', 'пунктов']

type Edit = (edit: (trip: TripData) => TripData) => void
type Transfer = Extract<PlanItem, { kind: 'transfer' }>

interface Props {
  trip: TripData
  plan: RoutePlan
  onEdit: Edit
  onSwapHotel: (stop: number) => void
  onAlternatives: (item: TripLeisure) => void
}

/** The leg a removed transfer comes after: the arrival for the first, the check-out before it for the others. */
const anchorOf = (leg: number) => (leg === 0 ? 'arrival' : `check-out-${leg - 1}`)

/**
 * The plan by calendar day: arrival, transfers, check-ins and check-outs, leisure and departure. Nights change
 * at each check-in, a transfer changes its mode or leaves the plan («Вернуть» brings it back), a hotel is
 * replaced. Leisure moves within its day (drag, or «Выше» / «Ниже» from the keyboard), to another day, gets
 * another time, an alternative from the model or leaves the plan; arrivals, check-ins and transfers stay put.
 */
export function TripTimeline({ trip, plan, onEdit, onSwapHotel, onAlternatives }: Props) {
  const [announcement, setAnnouncement] = useState('')
  const focusAfterMove = useRef<{ id: string; direction: 'up' | 'down' } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  // A moved item keeps the focus on its button, or on the other one at the end of the day.
  useEffect(() => {
    const target = focusAfterMove.current
    if (!target) return
    focusAfterMove.current = null
    const button = (direction: string) =>
      listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${target.id}"][data-direction="${direction}"]`)
    const same = button(target.direction)
    ;(same && !same.disabled ? same : button(target.direction === 'up' ? 'down' : 'up'))?.focus()
  }, [plan])

  const ends = [trip.route.arrival.name, ...plan.stays.map((stay) => stay.hotel.name), trip.route.departure.name]
  const removed = new Map<string, number[]>()
  trip.transfers.forEach((choice, leg) => {
    if (choice === 'none') removed.set(anchorOf(leg), [...(removed.get(anchorOf(leg)) ?? []), leg])
  })
  const hidden = trip.leisure.filter((item) => item.day > plan.days.length).length
  const leisureOf = (item: PlanItem) =>
    item.kind === 'leisure' ? trip.leisure.find((l) => l.id === item.leisure.id) : undefined

  const move = (leisure: TripLeisure, direction: 'up' | 'down') => {
    focusAfterMove.current = { id: leisure.id, direction }
    onEdit((t) => moveLeisure(t, leisure.id, direction === 'up' ? -1 : 1))
    setAnnouncement(`«${leisure.title}» — ${direction === 'up' ? 'выше' : 'ниже'}`)
  }
  const toDay = (leisure: TripLeisure, day: number) => {
    onEdit((t) => moveLeisureToDay(t, leisure.id, day))
    setAnnouncement(`«${leisure.title}» перенесён на день ${day}`)
  }
  const drop = (event: DragEvent, day: number, targetId?: string) => {
    event.preventDefault()
    event.stopPropagation()
    const id = event.dataTransfer.getData('text/plain')
    const source = trip.leisure.find((l) => l.id === id)
    if (!source) return
    if (source.day !== day) toDay(source, day)
    else if (targetId) onEdit((t) => moveLeisure(t, id, targetId))
  }
  const allowDrop = (event: DragEvent) => {
    if (event.dataTransfer.types.includes('text/plain')) event.preventDefault()
  }

  return (
    <>
      <ol ref={listRef} aria-label="План по дням" className="flex flex-col gap-6">
        {plan.days.map((day) => {
          const order = dayLeisure(trip, day.day).map((l) => l.id)
          return (
            <li key={day.day} className="flex flex-col gap-3" data-day={day.day}>
              <h3 className="text-lg font-bold">
                День {day.day} <span className="font-semibold text-muted-foreground">· {formatShortDay(day.date)}</span>
              </h3>
              <ol
                aria-label={`День ${day.day}`}
                className="flex min-h-10 flex-col gap-2 border-l-2 border-border pl-4"
                onDragOver={allowDrop}
                onDrop={(event) => drop(event, day.day)}
              >
                {day.items.map((item) => {
                  const key = itemKey(item)
                  const leisure = leisureOf(item)
                  return [
                    <li
                      key={key}
                      data-kind={item.kind}
                      draggable={Boolean(leisure)}
                      onDragStart={
                        leisure
                          ? (event) => {
                              event.dataTransfer.setData('text/plain', leisure.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }
                          : undefined
                      }
                      onDragOver={leisure ? allowDrop : undefined}
                      onDrop={leisure ? (event) => drop(event, day.day, leisure.id) : undefined}
                    >
                      {item.kind === 'transfer' ? (
                        <TransferNode
                          item={item}
                          onChange={(choice) => onEdit((t) => setTransfer(t, item.leg, choice))}
                        />
                      ) : leisure ? (
                        <LeisureNode
                          item={item}
                          leisure={leisure}
                          days={plan.days.length}
                          position={order.indexOf(leisure.id)}
                          count={order.length}
                          onMove={(direction) => move(leisure, direction)}
                          onDay={(target) => toDay(leisure, target)}
                          onTime={(value) => onEdit((t) => setLeisureTime(t, leisure.id, value))}
                          onRemove={() => {
                            onEdit((t) => removeLeisure(t, leisure.id))
                            setAnnouncement(`«${leisure.title}» убран из плана`)
                          }}
                          onAlternatives={() => onAlternatives(leisure)}
                        />
                      ) : (
                        <PlanNode
                          item={item as Exclude<PlanItem, { kind: 'transfer' | 'leisure' }>}
                          stay={item.kind === 'check-in' ? plan.stays[item.stop] : undefined}
                          onNights={(stop, nights) => onEdit((t) => setNights(t, stop, nights))}
                          onSwapHotel={onSwapHotel}
                        />
                      )}
                    </li>,
                    ...(removed.get(key) ?? []).map((leg) => (
                      <li key={`removed-${leg}`} data-kind="removed-transfer">
                        <RemovedTransfer
                          from={ends[leg]}
                          to={ends[leg + 1]}
                          onRestore={() => onEdit((t) => restoreTransfer(t, leg))}
                        />
                      </li>
                    )),
                  ]
                })}
              </ol>
            </li>
          )
        })}
      </ol>
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          Ещё {countRu(hidden, itemsForms)} досуга — после последнего дня поездки: добавьте ночей, и они вернутся в
          план.
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}

function PlanNode({
  item,
  stay,
  onNights,
  onSwapHotel,
}: {
  item: Exclude<PlanItem, { kind: 'transfer' | 'leisure' }>
  stay?: PlanStay
  onNights: (stop: number, nights: number) => void
  onSwapHotel: (stop: number) => void
}) {
  const Icon = ITEM_ICON[item.kind]
  return (
    <div className="flex gap-3 py-1.5">
      <Time item={item} />
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
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
        {stay && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div role="group" aria-label={`Ночи: ${stay.hotel.name}`} className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Минус ночь"
                disabled={stay.nights <= 1}
                onClick={() => onNights(stay.stop, stay.nights - 1)}
              >
                <Minus aria-hidden />
              </Button>
              <output aria-live="polite" className="min-w-18 text-center font-semibold">
                {countRu(stay.nights, nightForms)}
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
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => onSwapHotel(stay.stop)}>
              Заменить отель
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** A transfer stands out: its mode, time and price, and a menu to change the mode or remove it from the plan. */
function TransferNode({ item, onChange }: { item: Transfer; onChange: (choice: TransferChoice) => void }) {
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
        <div className="flex min-w-0 flex-1 basis-40 flex-col">
          <p className="font-bold">{label}</p>
          <p className="text-sm text-muted-foreground">
            {item.from} → {item.to}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.minutes} мин · {formatDecimal(item.km)} км
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold whitespace-nowrap">
            {item.mode === 'car' ? 'в аренде' : formatPrice(item.price)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" aria-label={`Изменить: ${item.from} → ${item.to}`} />}
            >
              Изменить <ChevronDown aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuRadioGroup value={item.mode} onValueChange={(mode) => onChange(mode as TransferChoice)}>
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
              <DropdownMenuItem variant="destructive" closeOnClick onClick={() => onChange('none')}>
                <Trash2 aria-hidden /> Убрать из плана
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

function RemovedTransfer({ from, to, onRestore }: { from: string; to: string; onRestore: () => void }) {
  return (
    <div
      role="group"
      aria-label={`Трансфер убран: ${from} → ${to}`}
      className="-ml-[25px] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
    >
      <span className="min-w-0 flex-1 basis-40">
        Трансфер убран: {from} → {to}
      </span>
      <Button variant="outline" size="sm" onClick={onRestore}>
        <RotateCcw aria-hidden /> Вернуть
      </Button>
    </div>
  )
}

function LeisureNode({
  item,
  leisure,
  days,
  position,
  count,
  onMove,
  onDay,
  onTime,
  onRemove,
  onAlternatives,
}: {
  item: PlanItem
  leisure: TripLeisure
  days: number
  position: number
  count: number
  onMove: (direction: 'up' | 'down') => void
  onDay: (day: number) => void
  onTime: (value: string) => void
  onRemove: () => void
  onAlternatives: () => void
}) {
  const Icon = ITEM_ICON.leisure
  const others = Array.from({ length: days }, (_, i) => i + 1).filter((day) => day !== leisure.day)
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl py-1.5 hover:bg-muted/50">
      <GripVertical className="mt-2 hidden size-4 shrink-0 cursor-grab text-muted-foreground sm:block" aria-hidden />
      <NativeSelect
        size="sm"
        aria-label={`Время: ${leisure.title}`}
        value={leisure.time}
        onChange={(event) => onTime(event.target.value)}
        className="w-22 shrink-0 tabular-nums"
      >
        {timesWith(leisure.time).map((time) => (
          <NativeSelectOption key={time} value={time}>
            {time}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <div className="flex min-w-0 flex-1 basis-48 gap-3">
        <Icon className="mt-2 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5">
          <p className="font-semibold">{itemTitle(item)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {leisure.category} · {item.minutes} мин
            </span>
            <Badge variant="secondary">Доп. услуга · {leisure.price ? formatPrice(leisure.price) : 'бесплатно'}</Badge>
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Выше: ${leisure.title}`}
          data-move={leisure.id}
          data-direction="up"
          disabled={position <= 0}
          onClick={() => onMove('up')}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ниже: ${leisure.title}`}
          data-move={leisure.id}
          data-direction="down"
          disabled={position >= count - 1}
          onClick={() => onMove('down')}
        >
          <ArrowDown aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Действия: ${leisure.title}`} />}
          >
            <EllipsisVertical aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem closeOnClick onClick={onAlternatives}>
              <Sparkles aria-hidden /> Предложить другое
            </DropdownMenuItem>
            {others.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Перенести</DropdownMenuLabel>
                  {others.map((day) => (
                    <DropdownMenuItem key={day} closeOnClick onClick={() => onDay(day)}>
                      <CalendarArrowDown aria-hidden /> На день {day}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" closeOnClick onClick={onRemove}>
              <Trash2 aria-hidden /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
