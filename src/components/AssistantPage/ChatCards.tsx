import { useId, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import {
  BedDouble,
  Building,
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  MapPin,
  Minus,
  Moon,
  Palmtree,
  Plus,
  Smile,
  User,
  Wallet,
  Waves,
  X,
} from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import type { Destination } from '@/data/destinations'
import { GUEST_LIMITS, VIBE_LABEL, briefWithStay, stayDates, type Brief, type VibeId } from '../../lib/assistant'
import type { AgentStep } from '../../lib/assistantChats'
import type { IsoDate } from '../../lib/dates'
import { VIEW_LABEL, type ViewKind } from '../../lib/features'
import { formatMeters } from '../../lib/format'
import type { Guests } from '../../lib/search'
import { briefGuestsOf, paramLine, sessionParams, type ParamKey, type SessionParam } from '../../lib/sessionMemory'

// The cards of Эвал's feed beside its words: what it saved to the session, the tools it called, the row of the work
// in progress and the parameters of «ничего не нашёл», each one changed in place.

/** The flat light grey card of the feed, the width of its content at most. */
const cardClass = 'w-fit max-w-full rounded-[18px] bg-muted px-3 py-2.5'
/** The round icon of a card: white on the grey, the project's blue inside. */
const circleClass =
  'size-10 rounded-full bg-card text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_18%,transparent)] [&_svg]:size-5'
/** Secondary text on the grey: 6.5:1 there. */
const greyMutedText = 'text-muted-foreground-strong'

/** A card of the feed on the trace of AI Elements: the icon in its circle, the bold line and the lines under it. */
function TraceCard({
  icon,
  title,
  lines,
  failed,
  label,
}: {
  icon: ReactNode
  title: string
  lines: readonly string[]
  failed?: boolean
  /** Said before the title to a screen reader. */
  label: string
}) {
  return (
    <Trace className={cardClass}>
      <TraceLine status={failed ? 'error' : undefined} className="w-full gap-3 text-foreground">
        <TraceIcon className={cn(circleClass, failed && 'text-destructive')}>{icon}</TraceIcon>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="sr-only">{label} </span>
          <TraceTitle className="text-[15px]/[1.3] font-semibold whitespace-normal text-foreground">{title}</TraceTitle>
          {lines.map((line) => (
            <span key={line} className={`text-sm/[1.35] whitespace-normal ${greyMutedText}`}>
              {line}
            </span>
          ))}
        </span>
      </TraceLine>
    </Trace>
  )
}

/** «Сохранил в память сессии»: a line a parameter the turn saved. */
export function MemoryCard({ params }: { params: readonly SessionParam[] }) {
  return (
    <TraceCard
      icon={<Check strokeWidth={2.5} />}
      title="Сохранил в память сессии"
      lines={params.map(paramLine)}
      label="Память сессии:"
    />
  )
}

/** A tool Эвал called: what it did with what, and what came of it; a cross when it failed. */
export function ToolCard({ step, failed }: { step: AgentStep; failed?: boolean }) {
  const detail = [step.params, step.result].filter(Boolean).join(' · ')
  return (
    <TraceCard
      icon={failed ? <X strokeWidth={2.5} /> : <Check strokeWidth={2.5} />}
      title={step.title}
      lines={detail ? [detail] : []}
      failed={failed}
      label={failed ? 'Инструмент, не удалось:' : 'Инструмент, готово:'}
    />
  )
}

/** «Ищу подходящие варианты…» with the three dots: Эвал is at work. */
export function WorkingRow({
  text,
  label = text,
  icon: Icon = Waves,
}: {
  text: string
  /** What a screen reader hears. */
  label?: string
  icon?: ComponentType<{ className?: string }>
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex w-[min(100%,22rem)] items-center gap-3 rounded-[18px] bg-muted py-2 pr-4 pl-2"
    >
      <span className="grid size-9 flex-none place-items-center rounded-full bg-card text-muted-foreground" aria-hidden>
        <Icon className="size-5" />
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${greyMutedText}`} aria-hidden>
        {text}
      </span>
      <span className="flex flex-none gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </span>
    </div>
  )
}

const ICONS: Record<ParamKey, ComponentType<{ className?: string }>> = {
  dates: CalendarDays,
  when: CalendarDays,
  nights: Moon,
  guests: User,
  rooms: BedDouble,
  city: MapPin,
  vibe: Palmtree,
  mood: Smile,
  budget: Wallet,
  sea: Waves,
  quiet: Moon,
  height: Building,
  view: Eye,
}

/** The distances to the sea the card offers. */
const SEA_CHOICES = [300, 500, 1000, 2000, 5000] as const
const VIEWS: readonly (ViewKind | 'any')[] = ['sea', 'water', 'city', 'park', 'garden', 'pool', 'any']
const DEFAULT_GUESTS: Guests = { adults: 2, children: 0, rooms: 1 }

const without = (brief: Brief, ...keys: (keyof Brief)[]): Brief => {
  const next = { ...brief }
  for (const key of keys) delete next[key]
  return next
}

interface ParamsProps {
  /** The brief the search went by. */
  brief: Brief
  destinations: readonly Destination[]
  today: IsoDate
  /** A parameter changed: the new brief. Absent where the card is read only (an older answer, a shared chat). */
  onChange?: (brief: Brief) => void
  /** Эвал is answering: the changes wait. */
  disabled?: boolean
}

/**
 * The parameters of the session under «Пока не нашёл точных совпадений»: each row opens with its chevron and changes
 * the parameter; the change goes to the session and the search is asked again.
 */
export function SessionParamsCard({ brief, destinations, today, onChange, disabled }: ParamsProps) {
  const params = sessionParams(brief, destinations)
  if (params.length === 0) return null
  return (
    <ul
      aria-label="Параметры поиска"
      className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-2xl bg-card shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_60%,transparent)]"
    >
      {params.map((param) => (
        <li key={param.key}>
          <ParamRow
            param={param}
            brief={brief}
            destinations={destinations}
            today={today}
            onChange={onChange}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  )
}

function ParamRow({ param, ...props }: ParamsProps & { param: SessionParam }) {
  const Icon = ICONS[param.key]
  const [open, setOpen] = useState(false)
  const head = (
    <>
      <span
        className="grid size-10 flex-none place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-primary"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-[15px]/[1.3] font-semibold text-foreground">{param.label}</span>
        <span className="text-sm/[1.35] text-muted-foreground">{param.value}</span>
      </span>
    </>
  )
  if (!props.onChange) return <div className="flex items-center gap-3 px-3 py-2.5">{head}</div>
  const apply = (next: Brief) => {
    setOpen(false)
    props.onChange!(next)
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring"
        aria-label={`${param.label}: ${param.value}. Изменить`}
      >
        {head}
        <ChevronDown
          className={cn('size-5 flex-none text-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <ParamEditor param={param} {...props} onChange={apply} />
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A choice of values: a press applies it. */
function Choices({
  options,
  disabled,
}: {
  options: { label: string; active: boolean; apply: () => void }[]
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1" role="group">
      {options.map(({ label, active, apply }) => (
        <Button
          key={label}
          type="button"
          size="sm"
          shape="pill"
          variant={active ? 'default' : 'outline'}
          aria-pressed={active}
          disabled={disabled}
          onClick={apply}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`${label}: меньше`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <output className="w-6 text-center text-base font-semibold" aria-label={label}>
          {value}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`${label}: больше`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </span>
    </div>
  )
}

function ApplyForm({
  children,
  error,
  disabled,
  onSubmit,
}: {
  children: ReactNode
  error?: string
  disabled?: boolean
  onSubmit: () => void
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form className="flex flex-col gap-3 pt-1" onSubmit={submit} noValidate>
      {children}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" shape="pill" className="self-start" disabled={disabled}>
        Применить
      </Button>
    </form>
  )
}

function DatesEditor({ brief, today, disabled, onChange }: ParamsProps & { onChange: (brief: Brief) => void }) {
  const id = useId()
  const [checkIn, setCheckIn] = useState(brief.dates?.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(brief.dates?.checkOut ?? '')
  const [error, setError] = useState('')
  return (
    <ApplyForm
      error={error}
      disabled={disabled}
      onSubmit={() => {
        const stay = stayDates(checkIn, checkOut)
        if (!stay || stay.checkIn < today)
          return setError('Выберите даты заезда и выезда: заезд не раньше сегодняшнего дня, не больше 30 ночей.')
        onChange({ ...without(brief, 'datesRejected'), ...briefWithStay(stay) })
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-in`}>
          Заезд
          <Input id={`${id}-in`} type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-out`}>
          Выезд
          <Input
            id={`${id}-out`}
            type="date"
            min={checkIn || today}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </label>
      </div>
    </ApplyForm>
  )
}

function GuestsEditor({
  brief,
  disabled,
  rooms,
  onChange,
}: ParamsProps & { rooms: boolean; onChange: (brief: Brief) => void }) {
  const [guests, setGuests] = useState<Guests>(briefGuestsOf(brief) ?? DEFAULT_GUESTS)
  const set = (change: Partial<Guests>) =>
    setGuests((g) => {
      const next = { ...g, ...change }
      return { ...next, rooms: Math.min(next.rooms, next.adults) }
    })
  return (
    <ApplyForm disabled={disabled} onSubmit={() => onChange({ ...brief, guests })}>
      {rooms ? (
        <Counter
          label="Номера"
          value={guests.rooms}
          min={GUEST_LIMITS.rooms[0]}
          max={Math.min(GUEST_LIMITS.rooms[1], guests.adults)}
          onChange={(value) => set({ rooms: value })}
        />
      ) : (
        <>
          <Counter
            label="Взрослые"
            value={guests.adults}
            min={GUEST_LIMITS.adults[0]}
            max={GUEST_LIMITS.adults[1]}
            onChange={(value) => set({ adults: value })}
          />
          <Counter
            label="Дети"
            value={guests.children}
            min={GUEST_LIMITS.children[0]}
            max={GUEST_LIMITS.children[1]}
            onChange={(value) => set({ children: value })}
          />
        </>
      )}
    </ApplyForm>
  )
}

function CityEditor({ brief, destinations, disabled, onChange }: ParamsProps & { onChange: (brief: Brief) => void }) {
  const id = useId()
  const [city, setCity] = useState(brief.destinationId ?? '')
  return (
    <ApplyForm
      disabled={disabled}
      onSubmit={() => onChange(city ? { ...brief, destinationId: city } : without(brief, 'destinationId'))}
    >
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={id}>
        Город
        <NativeSelect id={id} className="w-full" value={city} onChange={(e) => setCity(e.target.value)}>
          <NativeSelectOption value="">Любой</NativeSelectOption>
          {destinations.map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.name}, {d.country}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
    </ApplyForm>
  )
}

function BudgetEditor({ brief, disabled, onChange }: ParamsProps & { onChange: (brief: Brief) => void }) {
  const id = useId()
  const [value, setValue] = useState(String(brief.budget ?? ''))
  const [error, setError] = useState('')
  return (
    <ApplyForm
      error={error}
      disabled={disabled}
      onSubmit={() => {
        const amount = Number(value.replace(/\s/g, ''))
        if (!value.trim()) return onChange(without(brief, 'budget'))
        if (!Number.isFinite(amount) || amount < 1) return setError('Введите сумму в рублях или оставьте поле пустым.')
        onChange({ ...brief, budget: Math.round(amount) })
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={id}>
        Бюджет на всю поездку, ₽
        <Input
          id={id}
          inputMode="numeric"
          placeholder="Без ограничения"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
        />
      </label>
    </ApplyForm>
  )
}

/** The editor of a parameter: the fields of the dates, the guests, the city and the budget; the choices otherwise. */
function ParamEditor({ param, ...props }: ParamsProps & { param: SessionParam; onChange: (brief: Brief) => void }) {
  const { brief, disabled, onChange } = props
  const removal = (...keys: (keyof Brief)[]) => ({
    label: 'Не важно',
    active: false,
    apply: () => onChange(without(brief, ...keys)),
  })
  switch (param.key) {
    case 'dates':
    case 'when':
    case 'nights':
      return <DatesEditor {...props} />
    case 'guests':
      return <GuestsEditor {...props} rooms={false} />
    case 'rooms':
      return <GuestsEditor {...props} rooms />
    case 'city':
      return <CityEditor {...props} />
    case 'budget':
      return <BudgetEditor {...props} />
    case 'sea':
      return (
        <Choices
          disabled={disabled}
          options={[
            ...SEA_CHOICES.map((m) => ({
              label: `до ${formatMeters(m)}`,
              active: brief.seaMaxM === m,
              apply: () => onChange({ ...brief, seaMaxM: m }),
            })),
            removal('seaMaxM'),
          ]}
        />
      )
    case 'vibe':
      return (
        <Choices
          disabled={disabled}
          options={(Object.keys(VIBE_LABEL) as VibeId[]).map((vibe) => ({
            label: VIBE_LABEL[vibe],
            active: brief.vibe === vibe,
            apply: () => onChange({ ...brief, vibe }),
          }))}
        />
      )
    case 'mood':
      return (
        <Choices
          disabled={disabled}
          options={[
            { label: 'спокойно', active: brief.mood === 'calm', apply: () => onChange({ ...brief, mood: 'calm' }) },
            { label: 'активно', active: brief.mood === 'active', apply: () => onChange({ ...brief, mood: 'active' }) },
            removal('mood'),
          ]}
        />
      )
    case 'quiet':
      return <Choices disabled={disabled} options={[removal('quiet')]} />
    case 'height':
      return (
        <Choices
          disabled={disabled}
          options={[
            { label: 'повыше', active: brief.height === 'high', apply: () => onChange({ ...brief, height: 'high' }) },
            { label: 'пониже', active: brief.height === 'low', apply: () => onChange({ ...brief, height: 'low' }) },
            removal('height'),
          ]}
        />
      )
    case 'view':
      return (
        <Choices
          disabled={disabled}
          options={[
            ...VIEWS.map((view) => ({
              label: view === 'any' ? 'любой' : VIEW_LABEL[view],
              active: brief.view === view,
              apply: () => onChange({ ...brief, view }),
            })),
            removal('view'),
          ]}
        />
      )
  }
}
