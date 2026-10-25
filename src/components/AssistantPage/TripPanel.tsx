import Link from 'next/link'
import { useId, useState, type FormEvent } from 'react'
import {
  Building,
  CalendarDays,
  ChevronRight,
  History,
  MapPin,
  MessagesSquare,
  Moon,
  Pencil,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { Destination } from '@/data/destinations'
import { briefWithStay, PARTY_LABEL, stayDates, type Brief, type Party, type Plan } from '../../lib/assistant'
import { nightsLabel, planMapHref, type TripParams } from '../../lib/assistantChatList'
import { formatShortDay, type IsoDate } from '../../lib/dates'
import { countRu, guestsLabel } from '../../lib/format'
import type { Guests } from '../../lib/search'

const cardClass =
  'flex flex-col gap-3 rounded-[24px] bg-(--decor-light) p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_60%,transparent)]'
const rowClass = 'flex items-center gap-3'
const rowIconClass =
  'grid size-10 flex-none place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_9%,var(--decor-light))] text-primary'

/** «2 взрослых, 1 ребёнок». */
const partyLine = ({ adults, children, rooms }: Guests) =>
  [
    countRu(adults, ['взрослый', 'взрослых', 'взрослых']),
    children > 0 && countRu(children, ['ребёнок', 'ребёнка', 'детей']),
    rooms > 1 && countRu(rooms, ['номер', 'номера', 'номеров']),
  ]
    .filter(Boolean)
    .join(', ')

interface Props {
  trip: TripParams
  /** The newest answer with hotels: the map shows them. */
  plan: Plan | undefined
  recent: readonly string[]
  /** Eval is answering, or the chats are loading: the requests wait. */
  busy: boolean
  onEdit: () => void
  onAsk: (text: string) => void
  className?: string
}

/**
 * The right column of the wider screens: the trip of the open chat (the dates with the nights, the guests, the city)
 * with the pencil and the map of the newest answer's hotels, the traveller's recent requests (a press asks again in
 * this chat) and what Eval can do now.
 */
export function TripPanel({ trip, plan, recent, busy, onEdit, onAsk, className = '' }: Props) {
  const hotels = plan?.options.some((o) => o.hotel)
  const known = trip.checkIn || trip.guests || trip.city
  return (
    <aside aria-label="О поездке" className={`flex min-h-0 flex-col gap-3 overflow-y-auto ${className}`}>
      <section aria-labelledby="trip-title" className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="trip-title" className="text-base font-bold">
            Параметры поездки
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary"
            aria-label="Изменить параметры поездки"
            onClick={onEdit}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        </div>
        {known ? (
          <dl className="flex flex-col gap-2.5">
            {trip.checkIn && trip.checkOut && (
              <div className={rowClass}>
                <span className={rowIconClass} aria-hidden>
                  <CalendarDays className="size-5" />
                </span>
                <dt className="sr-only">Даты</dt>
                <dd className="min-w-0 text-sm/[1.35]">
                  <span className="block font-semibold">
                    {formatShortDay(trip.checkIn)} — {formatShortDay(trip.checkOut)}
                  </span>
                  {trip.nights !== undefined && (
                    <span className="text-muted-foreground">{nightsLabel(trip.nights)}</span>
                  )}
                </dd>
              </div>
            )}
            {trip.guests && (
              <div className={rowClass}>
                <span className={rowIconClass} aria-hidden>
                  <Users className="size-5" />
                </span>
                <dt className="sr-only">Гости</dt>
                <dd className="min-w-0 text-sm/[1.35]">
                  <span className="block font-semibold">{guestsLabel(trip.guests)}</span>
                  <span className="text-muted-foreground">{partyLine(trip.guests)}</span>
                </dd>
              </div>
            )}
            {trip.city && (
              <div className={rowClass}>
                <span className={rowIconClass} aria-hidden>
                  <MapPin className="size-5" />
                </span>
                <dt className="sr-only">Город</dt>
                <dd className="min-w-0 text-sm/[1.35]">
                  <span className="block font-semibold">{trip.city.name}</span>
                  <span className="text-muted-foreground">{trip.city.country}</span>
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm/[1.45] text-muted-foreground">
            Пока ничего не известно: опишите поездку в чате или задайте параметры карандашом.
          </p>
        )}
        {plan && hotels && (
          <Link
            href={planMapHref(plan)}
            className="group relative flex h-28 flex-col justify-end overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))] p-2 no-underline"
          >
            {/* A drawn map: the streets and the pin, not the real map, which opens on the search page. */}
            <span
              className="absolute inset-0 [background:repeating-linear-gradient(35deg,transparent_0_22px,color-mix(in_srgb,var(--decor-light)_80%,transparent)_22px_25px),repeating-linear-gradient(-55deg,transparent_0_30px,color-mix(in_srgb,var(--decor-light)_70%,transparent)_30px_32px)]"
              aria-hidden
            />
            <MapPin
              className="absolute top-5 left-1/2 size-8 -translate-x-1/2 fill-primary text-(--decor-light)"
              aria-hidden
            />
            <span className="relative flex items-center gap-2 rounded-xl bg-(--decor-light) px-3 py-2 text-sm font-semibold text-foreground shadow-(--shadow-card) group-hover:text-primary">
              <MapPin className="size-4 text-primary" aria-hidden />
              Показать на карте
              <ChevronRight className="ml-auto size-4" aria-hidden />
            </span>
          </Link>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-title" className={cardClass}>
          <h2 id="recent-title" className="text-base font-bold">
            Последние запросы
          </h2>
          <ul className="flex flex-col gap-1">
            {recent.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] px-3 py-2 text-left text-sm/[1.35] transition-colors hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-60"
                  disabled={busy}
                  onClick={() => onAsk(text)}
                >
                  <History className="size-4 flex-none text-primary" aria-hidden />
                  <span className="line-clamp-2 min-w-0">{text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="skills-title" className={cardClass}>
        <h2 id="skills-title" className="text-base font-bold">
          Возможности
        </h2>
        <ul className="flex flex-col gap-2.5">
          {SKILLS.map(({ icon: Icon, title, text }) => (
            <li key={title} className={rowClass}>
              <span className={rowIconClass} aria-hidden>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 text-sm/[1.35]">
                <span className="block font-semibold">{title}</span>
                <span className="text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}

/** What Eval can do now; nothing it cannot (no routes, flights or visas). */
const SKILLS = [
  { icon: Sparkles, title: 'Подбор по описанию', text: 'Поймёт пожелания своими словами' },
  { icon: Wallet, title: 'Даты и бюджет', text: 'Посчитает цену за весь срок' },
  { icon: Moon, title: 'Тишина, этажность, вид', text: 'По данным о шуме, зданиях и номерах — где они есть' },
  { icon: MessagesSquare, title: 'Несколько чатов', text: 'Каждый чат помнит свои условия' },
  { icon: Building, title: 'Подборка на карте', text: 'Покажет найденные отели на карте' },
] as const

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brief: Brief
  trip: TripParams
  destinations: readonly Destination[]
  today: IsoDate
  onSave: (brief: Brief) => void
}

const PARTIES = Object.keys(PARTY_LABEL) as Party[]

/**
 * The trip's parameters by hand: the dates, who goes and the city. They go to the chat's brief, so the line under
 * the title, this column and the next answer follow them.
 */
export function TripDialog({ open, onOpenChange, brief, trip, destinations, today, onSave }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* A new form on each opening starts from the chat's current values. */}
        {open && (
          <TripForm
            brief={brief}
            trip={trip}
            destinations={destinations}
            today={today}
            onSave={(next) => {
              onSave(next)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TripForm({ brief, trip, destinations, today, onSave }: Omit<DialogProps, 'open' | 'onOpenChange'>) {
  const id = useId()
  const [checkIn, setCheckIn] = useState(trip.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(trip.checkOut ?? '')
  const [party, setParty] = useState<Party | ''>(brief.party && brief.party !== 'any' ? brief.party : '')
  const [city, setCity] = useState(brief.destinationId ?? trip.city?.id ?? '')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: Brief = { ...brief }
    delete next.datesRejected
    if (checkIn || checkOut) {
      const stay = stayDates(checkIn, checkOut)
      if (!stay || stay.checkIn < today)
        return setError('Выберите даты заезда и выезда: заезд не раньше сегодняшнего дня, не больше 30 ночей.')
      Object.assign(next, briefWithStay(stay))
    }
    if (party) next.party = party
    if (city) next.destinationId = city
    else delete next.destinationId
    onSave(next)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Параметры поездки</DialogTitle>
        <DialogDescription>Эвал подберёт следующий ответ этого чата по ним.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-in`}>
          Заезд
          <Input
            id={`${id}-in`}
            type="date"
            min={today}
            value={checkIn}
            onChange={(e) => {
              setCheckIn(e.target.value)
              setError('')
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-out`}>
          Выезд
          <Input
            id={`${id}-out`}
            type="date"
            min={checkIn || today}
            value={checkOut}
            onChange={(e) => {
              setCheckOut(e.target.value)
              setError('')
            }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-party`}>
        Кто едет
        <NativeSelect id={`${id}-party`} value={party} onChange={(e) => setParty(e.target.value as Party | '')}>
          <NativeSelectOption value="">Не указано</NativeSelectOption>
          {PARTIES.map((p) => (
            <NativeSelectOption key={p} value={p}>
              {`${PARTY_LABEL[p][0].toLocaleUpperCase('ru')}${PARTY_LABEL[p].slice(1)}`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-city`}>
        Город
        <NativeSelect id={`${id}-city`} value={city} onChange={(e) => setCity(e.target.value)}>
          <NativeSelectOption value="">Любой</NativeSelectOption>
          {destinations.map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.name}, {d.country}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
        <Button type="submit">Сохранить</Button>
      </DialogFooter>
    </form>
  )
}
