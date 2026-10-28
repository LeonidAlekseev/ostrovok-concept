import { useId, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import {
  BedDouble,
  Building,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Eye,
  Loader2,
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
import { Badge } from '@/components/ui/badge'
import { DemoBadge } from '../DemoBadge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import type { Destination } from '@/data/destinations'
import { GUEST_LIMITS, VIBE_LABEL, briefWithStay, stayDates, type Brief, type VibeId } from '../../lib/assistant'
import type { AgentStep, MessageData } from '../../lib/assistantChats'
import { characteristicLabel } from '../../lib/hotelierFacts'
import { requestViewOf, type HotelierRequestView } from '../../lib/hotelierRequest'
import { useLiveRun } from './useLiveRun'
import { cancellationLabel } from '../../lib/booking'
import {
  EPISTEMIC_LABEL,
  isSafeUrl,
  type ToolClaim,
  type ToolEvidence,
  type ToolResult,
  type ToolRun,
} from '../../lib/toolResult'
import { formatDateRange, nightsBetween, type IsoDate } from '../../lib/dates'
import { VIEW_LABEL, type ViewKind } from '../../lib/features'
import { countRu, formatMeters, formatPrice } from '../../lib/format'
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

const stay = (checkIn: IsoDate, checkOut: IsoDate) =>
  `${formatDateRange(checkIn, checkOut)}, ${countRu(nightsBetween(checkIn, checkOut), ['ночь', 'ночи', 'ночей'])}`

/**
 * The change of a booking's dates Эвал proposed: the dates and the price now and after, the cancellation terms, and
 * «Подтвердить» — nothing changes without it. Applied, it says so; a booking changed since then makes it outdated. A
 * shared chat shows it without the button (`onConfirm` absent).
 */
export function DateChangeCard({
  change: { proposal, state },
  onConfirm,
}: {
  change: NonNullable<MessageData['change']>
  onConfirm?: () => void
}) {
  const difference = proposal.total - proposal.from.total
  const rows: [string, string][] = [
    ['Сейчас', `${stay(proposal.from.checkIn, proposal.from.checkOut)} · ${formatPrice(proposal.from.total)}`],
    ['Новые даты', stay(proposal.checkIn, proposal.checkOut)],
    [
      'Новая цена',
      `${formatPrice(proposal.total)}${difference === 0 ? '' : difference > 0 ? ` (доплата ${formatPrice(difference)})` : ` (меньше на ${formatPrice(-difference)})`}`,
    ],
    ['Отмена', cancellationLabel(proposal.cancellation, proposal.checkIn, { short: true })],
  ]
  return (
    <section
      aria-label={`Перенос бронирования ${proposal.bookingId}`}
      className="flex w-full max-w-md flex-col gap-3 rounded-[18px] border bg-card p-3.5"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <CalendarDays className="size-5 text-primary" aria-hidden />
        Перенос бронирования {proposal.bookingId}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className={greyMutedText}>{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {state === 'applied' ? (
        <p role="status" className="flex items-center gap-1.5 font-semibold text-success-foreground">
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
          Даты изменены
        </p>
      ) : state === 'outdated' ? (
        <p role="status" className={greyMutedText}>
          Бронирование изменилось после расчёта — попросите Эвала посчитать заново.
        </p>
      ) : (
        onConfirm && (
          <Button className="w-fit" onClick={onConfirm}>
            Подтвердить
          </Button>
        )
      )}
    </section>
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

const RUN_STATUS: Record<ToolResult['status'], string> = {
  running: 'Выполняется',
  pending: 'Ждёт ответа',
  success: 'Готово',
  error: 'Ошибка',
}

const SOURCE_TYPE: Record<ToolEvidence['source_type'], string> = {
  dataset: 'Набор данных',
  osm: 'Объект OpenStreetMap',
  review: 'Отзыв гостя',
  ota_page: 'Страница Островка',
  calculation: 'Расчёт',
  hotelier: 'Ответ отельера',
}

/** «26 октября 2026 г.»; nothing for a date that does not read. */
function dateLabel(iso: string | null): string | null {
  const time = iso ? Date.parse(iso) : NaN
  return Number.isNaN(time)
    ? null
    : new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** A heading of a part of «Источники и данные». */
function RunSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  )
}

/** A source of the run: its provider and title (a link only to http(s)), its id, date and the words used. */
function SourceItem({ source }: { source: ToolEvidence }) {
  const date = dateLabel(source.retrieved_at)
  const meta = [
    SOURCE_TYPE[source.source_type],
    source.source_id && `ID: ${source.source_id}`,
    date && `получено ${date}`,
  ].filter(Boolean)
  return (
    <li className="flex flex-col gap-0.5 rounded-xl bg-card px-3 py-2 text-sm/[1.35]">
      <span className="font-semibold text-foreground">
        {source.source_name}
        {source.demo && <DemoBadge className="ml-1.5" />}
      </span>
      {source.source_url && isSafeUrl(source.source_url) ? (
        <a
          href={source.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-primary underline underline-offset-2"
        >
          {source.title}
        </a>
      ) : (
        <span className="break-words text-foreground">{source.title}</span>
      )}
      <span className="text-muted-foreground">{meta.join(' · ')}</span>
      {source.excerpt && (
        <blockquote className="mt-1 border-l-2 border-border pl-2 break-words whitespace-pre-line text-foreground">
          {source.excerpt}
        </blockquote>
      )}
    </li>
  )
}

/** A characteristic of a run: its value, how it is known, the confidence when it has a basis, its sources. */
function ClaimItem({ claim, names }: { claim: ToolClaim; names: ReadonlyMap<string, string> }) {
  const sources = [...new Set(claim.evidence_ids.flatMap((id) => names.get(id) ?? []))]
  const origin = [
    EPISTEMIC_LABEL[claim.status],
    claim.confidence !== null && `уверенность ${Math.round(claim.confidence * 100)} %`,
    sources.length > 0 && `источник: ${sources.join(', ')}`,
  ].filter(Boolean)
  return (
    <li className="text-sm/[1.35]">
      <span className="text-foreground">
        {claim.label}: <span className="font-semibold">{claim.value}</span>
        {claim.demo && <DemoBadge className="ml-1.5" />}
      </span>
      <span className={`block ${greyMutedText}`}>{origin.join(' · ')}</span>
    </li>
  )
}

/** The hotels of a run shown before «Показать все». */
const GROUPS_SHOWN = 3

/** The characteristics by hotel: each with its verdict; a long list opens with a button. */
function RunGroups({ result, names }: { result: ToolResult; names: ReadonlyMap<string, string> }) {
  const [all, setAll] = useState(false)
  const groups = result.groups ?? []
  const claims = new Map(result.claims.map((c) => [c.id, c]))
  const shown = all ? groups : groups.slice(0, GROUPS_SHOWN)
  return (
    <RunSection title="По отелям">
      <ul className="flex flex-col gap-2">
        {shown.map((group) => (
          <li key={group.id} className="flex flex-col gap-1 rounded-xl bg-card px-3 py-2" data-group={group.id}>
            <span className="text-sm/[1.35] font-semibold text-foreground">{group.title}</span>
            {group.note && <span className={`text-sm/[1.35] ${greyMutedText}`}>{group.note}</span>}
            {group.claim_ids.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {group.claim_ids.flatMap((id) => {
                  const claim = claims.get(id)
                  return claim ? [<ClaimItem key={id} claim={claim} names={names} />] : []
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {groups.length > GROUPS_SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-fit rounded-md py-1 text-sm font-semibold text-primary focus-visible:outline-3 focus-visible:outline-ring"
        >
          {all ? 'Свернуть' : `Показать все (${groups.length})`}
        </button>
      )}
    </RunSection>
  )
}

/** «Источники и данные» of a run: the characteristics with their origin, the calculations, the sources, the limits. */
function RunDetails({ result }: { result: ToolResult }) {
  const names = new Map(result.evidence.map((e) => [e.id, e.source_name]))
  const grouped = new Set((result.groups ?? []).flatMap((g) => g.claim_ids))
  const loose = result.claims.filter((c) => !grouped.has(c.id))
  return (
    <div className="flex flex-col gap-3 pt-2">
      {result.error && <p className="text-sm/[1.35] text-destructive">{result.error.message}</p>}
      {(result.groups?.length ?? 0) > 0 && <RunGroups result={result} names={names} />}
      {loose.length > 0 && (
        <RunSection title="Полученные характеристики">
          <ul className="flex flex-col gap-1.5">
            {loose.map((claim) => (
              <ClaimItem key={claim.id} claim={claim} names={names} />
            ))}
          </ul>
        </RunSection>
      )}
      {result.calculations.length > 0 && (
        <RunSection title="Расчёты">
          <ul className="flex flex-col gap-2">
            {result.calculations.map((calculation) => (
              <li key={calculation.id} className="flex flex-col gap-0.5 text-sm/[1.35]">
                <span className="text-foreground">
                  {calculation.name} <span className={greyMutedText}>(версия {calculation.version})</span>
                </span>
                {calculation.inputs.length > 0 && (
                  <span className={greyMutedText}>
                    Входные данные: {calculation.inputs.map((i) => `${i.label} — ${i.value}`).join('; ')}
                  </span>
                )}
                {calculation.assumptions.length > 0 && (
                  <span className={greyMutedText}>Допущения: {calculation.assumptions.join('; ')}</span>
                )}
              </li>
            ))}
          </ul>
        </RunSection>
      )}
      <RunSection title="Источники">
        {result.evidence.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {result.evidence.map((source) => (
              <SourceItem key={source.id} source={source} />
            ))}
          </ul>
        ) : (
          <p className={`text-sm/[1.35] ${greyMutedText}`}>Источников нет: инструмент не нашёл данных с источником.</p>
        )}
      </RunSection>
      {result.method && (
        <RunSection title="Метод">
          <p className="text-sm/[1.35] text-foreground">
            {result.method.name} <span className={greyMutedText}>(версия {result.method.version})</span>
          </p>
          {result.method.inputs.length > 0 && (
            <p className={`text-sm/[1.35] ${greyMutedText}`}>
              Входные данные: {result.method.inputs.map((i) => `${i.label} — ${i.value}`).join('; ')}
            </p>
          )}
          {result.method.assumptions.length > 0 && (
            <p className={`text-sm/[1.35] ${greyMutedText}`}>Допущения: {result.method.assumptions.join('; ')}</p>
          )}
        </RunSection>
      )}
      {result.limitations.length > 0 && (
        <RunSection title="Ограничения">
          <ul className={`list-disc pl-5 text-sm/[1.35] ${greyMutedText}`}>
            {result.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </RunSection>
      )}
    </div>
  )
}

/**
 * The block of a tool's run: what it does, its status and short result, and «Источники и данные» that opens in place.
 * Each block keeps its own state; nothing of the model's reasoning, no JSON and no names of functions are shown.
 */
export function ToolRunCard({ step, run: saved }: { step: AgentStep; run: ToolRun }) {
  const [open, setOpen] = useState(false)
  // A run of «Запрос отельеру» is read again while it waits: the hotelier's answer finishes it later.
  const run = useLiveRun(saved)
  const { result } = run
  const status = result.status
  const request = requestViewOf(result)
  if (request) return <HotelierRequestCard step={step} run={run} request={request} />
  return (
    <div
      className={cn(cardClass, 'flex w-full flex-col sm:w-[min(100%,36rem)]')}
      data-run={run.id}
      data-run-status={status}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(circleClass, 'grid flex-none place-items-center', status === 'error' && 'text-destructive')}
        >
          {status === 'running' ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden />
          ) : status === 'pending' ? (
            <Clock aria-hidden />
          ) : status === 'error' ? (
            <X strokeWidth={2.5} aria-hidden />
          ) : (
            <Check strokeWidth={2.5} aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px]/[1.3] font-semibold text-foreground">{step.title}</span>
          {step.params && <span className={`text-sm/[1.35] ${greyMutedText}`}>{step.params}</span>}
          <span
            className={cn('text-sm/[1.35] font-semibold', status === 'error' ? 'text-destructive' : 'text-foreground')}
          >
            {RUN_STATUS[status]}
          </span>
          {result.summary && <span className="text-sm/[1.35] text-foreground">{result.summary}</span>}
        </span>
      </div>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="mt-2 flex w-full items-center justify-between gap-2 rounded-md py-1 text-sm font-semibold text-primary focus-visible:outline-3 focus-visible:outline-ring"
          aria-label={`Источники и данные: ${step.title}`}
        >
          Источники и данные
          <ChevronDown className={cn('size-4 flex-none transition-transform', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <RunDetails result={result} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** «Ищу подходящие варианты…» with a spinning loader: Эвал is at work. */
export function WorkingRow({
  text,
  label = text,
}: {
  text: string
  /** What a screen reader hears. */
  label?: string
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex w-[min(100%,22rem)] items-center gap-3 rounded-[18px] bg-muted py-2 pr-4 pl-2"
    >
      <span className="grid size-9 flex-none place-items-center rounded-full bg-card text-muted-foreground" aria-hidden>
        <Loader2 className="size-5 motion-safe:animate-spin" data-testid="working-loader" />
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${greyMutedText}`} aria-hidden>
        {text}
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
            {
              label: 'спокойно',
              active: brief.mood === 'calm',
              apply: () => onChange({ ...brief, mood: 'calm' }),
            },
            {
              label: 'активно',
              active: brief.mood === 'active',
              apply: () => onChange({ ...brief, mood: 'active' }),
            },
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
            {
              label: 'повыше',
              active: brief.height === 'high',
              apply: () => onChange({ ...brief, height: 'high' }),
            },
            {
              label: 'пониже',
              active: brief.height === 'low',
              apply: () => onChange({ ...brief, height: 'low' }),
            },
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

/** «Источники и данные» of a run that opens in place: the AI assistant's answer in the chat with the hotel shows it too. */
export function RunSources({ result, label }: { result: ToolResult; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-md py-1 text-sm font-semibold text-primary focus-visible:outline-3 focus-visible:outline-ring"
        aria-label={label}
      >
        Источники
        <ChevronDown className={cn('size-4 flex-none transition-transform', open && 'rotate-180')} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RunDetails result={result} />
      </CollapsibleContent>
    </Collapsible>
  )
}

const REQUEST_STATUS: Record<HotelierRequestView['status'], string> = {
  pending: 'Ждёт ответа отельера',
  answered: 'Отельер ответил',
}

/**
 * The block «Запрос отельеру»: the hotel, the question and the characteristics asked; once the hotelier answered, the
 * same block shows the answer and the characteristics taken from it with their source. It comes of the run in
 * `tool_runs`, never of the model's words.
 */
function HotelierRequestCard({ step, run, request }: { step: AgentStep; run: ToolRun; request: HotelierRequestView }) {
  const [open, setOpen] = useState(false)
  const { result } = run
  const answered = request.status === 'answered'
  return (
    <section
      aria-label={step.title}
      className={cn(cardClass, 'flex w-full flex-col gap-2 sm:w-[min(100%,36rem)]')}
      data-run={run.id}
      data-run-status={result.status}
      data-request={request.requestId}
    >
      <div className="flex items-start gap-3">
        <span className={cn(circleClass, 'grid flex-none place-items-center')}>
          {answered ? <Check strokeWidth={2.5} aria-hidden /> : <Clock aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px]/[1.3] font-semibold text-foreground">{step.title}</span>
          {request.hotelName && <span className={`text-sm/[1.35] ${greyMutedText}`}>{request.hotelName}</span>}
          <span className="text-sm/[1.35] font-semibold text-foreground" role="status">
            {REQUEST_STATUS[request.status]}
          </span>
        </span>
      </div>
      <p className="text-sm/[1.4] text-foreground">
        <span className={greyMutedText}>Вопрос: </span>
        {request.question}
      </p>
      {request.keys.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Запрашиваемые характеристики">
          {request.keys.map((key) => (
            <li key={key}>
              <Badge className="bg-card font-normal">{characteristicLabel(key)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {request.answer && (
        <blockquote className="rounded-xl bg-card px-3 py-2 text-sm/[1.4] whitespace-pre-line break-words">
          <span className="block text-xs font-semibold text-muted-foreground">Ответ отельера</span>
          {request.answer}
        </blockquote>
      )}
      {request.knowledge === 'queued' && (
        <p className={`text-sm/[1.35] ${greyMutedText}`}>Сохраняю характеристики из ответа…</p>
      )}
      {request.knowledge === 'revoked' && (
        <p className={`text-sm/[1.35] ${greyMutedText}`}>
          Отельер отозвал сведения из этого ответа: Эвал их больше не использует.
        </p>
      )}
      {answered && result.claims.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Извлечённые характеристики">
          {result.claims.map((claim) => (
            <ClaimItem
              key={claim.id}
              claim={claim}
              names={new Map(result.evidence.map((e) => [e.id, e.source_name]))}
            />
          ))}
        </ul>
      )}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-sm font-semibold text-primary focus-visible:outline-3 focus-visible:outline-ring"
          aria-label={`Источники и данные: ${step.title}`}
        >
          Источники и данные
          <ChevronDown className={cn('size-4 flex-none transition-transform', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <RunDetails result={result} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
