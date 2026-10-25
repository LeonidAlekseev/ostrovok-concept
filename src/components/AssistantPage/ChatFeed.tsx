import Link from 'next/link'
import { Fragment, useRef, type ReactNode } from 'react'
import {
  ArrowDown,
  Car,
  Check,
  ChevronRight,
  Eye,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button, buttonVariants } from '@/components/ui/button'
import { Message, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import type { HotelSearch } from '@/hooks/useHotelSearch'
import { useHotels } from '@/hooks/useHotels'
import type { Hotel } from '@/lib/catalog'
import { VIEW_LABEL } from '@/lib/features'
import { hotelHref } from '@/lib/search'
import type { AssistantOption, Plan } from '../../lib/assistant'
import { messageTime, nightsLabel } from '../../lib/assistantChatList'
import type { ChatMessage } from '../../lib/assistantChats'
import { formatDateRange } from '../../lib/dates'
import { formatPrice, guestsLabel } from '../../lib/format'
import { HotelTile } from '../HotelTile/HotelTile'
import { MessagePhotos, type PhotoUrl } from './ChatPhotos'

/** The agent's bubble: no avatar beside it, the feed's full width at most. */
const agentBubble =
  'max-w-full *:data-[slot=bubble-content]:rounded-[18px_18px_18px_6px] *:data-[slot=bubble-content]:bg-(--decor-light) *:data-[slot=bubble-content]:px-3.5 *:data-[slot=bubble-content]:py-2.5 *:data-[slot=bubble-content]:text-base *:data-[slot=bubble-content]:shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]'
/** The shadow of the agent's cards and bubbles. */
const cardShadow = 'shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]'
const userBubble =
  'max-w-[85%] *:data-[slot=bubble-content]:rounded-[18px_18px_6px] *:data-[slot=bubble-content]:px-3.5 *:data-[slot=bubble-content]:py-2.5 *:data-[slot=bubble-content]:text-base'
const messageTextClass = 'leading-[1.45] whitespace-pre-wrap'
const timeClass = 'px-1 text-xs/[normal] text-muted-foreground'

export type ChooseSearch = HotelSearch['searchFor']

/** A shared chat has the public links of its photos and the previews that never reached Storage. */
const sharedPhotoUrl: PhotoUrl = (attachment, size) =>
  size === 'full' ? (attachment.url ?? attachment.preview) : (attachment.preview ?? attachment.url)

interface FeedProps {
  chatId: string
  messages: readonly ChatMessage[]
  onChoose: ChooseSearch
  /** Absent in a shared chat: it is read-only. */
  onRetry?: (messageId: string) => void
  /** The buttons under the newest answer with hotels; none in a shared chat. */
  planActions?: (plan: Plan) => ReactNode
  /** What shows a photo of a message; a shared chat has the public links. */
  photoUrl?: PhotoUrl
}

/**
 * The chat's messages in the Message Scroller of shadcn/ui. A chat opens at its end; the feed follows a new
 * message only while the traveller is at the end, and the traveller's own message settles at the top. Reading the
 * older messages, they get a button to the new one instead of a jump.
 */
export function Feed({ chatId, messages, onChoose, onRetry, planActions, photoUrl = sharedPhotoUrl }: FeedProps) {
  const lastPlanId = messages.findLast((m) => m.role === 'assistant' && m.data.plan?.options.length)?.id
  return (
    // A new provider per chat: each opens at its own end.
    <MessageScrollerProvider key={chatId} autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1">
        <MessageScrollerViewport aria-label="Лента чата" className="px-0.5 pt-0.5 pb-1">
          <MessageScrollerContent aria-label="Диалог с Эвалом" className="gap-3">
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === 'user'}
                data-step={message.role === 'agent' && message.data.step ? message.status : undefined}
                className="animate-in duration-250 ease-out fade-in slide-in-from-bottom-[6px]"
              >
                <MessageItem
                  message={message}
                  photoUrl={photoUrl}
                  onChoose={onChoose}
                  onRetry={onRetry && (() => onRetry(message.id))}
                  actions={message.id === lastPlanId && message.data.plan ? planActions?.(message.data.plan) : null}
                />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          render={<Button variant="secondary" size="sm" shape="pill" />}
          className="bottom-2 w-auto bg-(--decor-light) shadow-(--shadow-card) data-[direction=end]:bottom-2"
        >
          <ArrowDown className="size-4" aria-hidden />К новому сообщению
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

interface MessageProps {
  message: ChatMessage
  photoUrl: PhotoUrl
  onChoose: ChooseSearch
  onRetry?: () => void
  actions?: ReactNode
}

function MessageTime({ iso, align }: { iso: string; align?: 'end' }) {
  return (
    <time dateTime={iso} className={`${timeClass} ${align === 'end' ? 'self-end' : ''}`}>
      {messageTime(iso)}
    </time>
  )
}

function MessageItem({ message, photoUrl, onChoose, onRetry, actions }: MessageProps) {
  const { role, status, text, data, createdAt } = message
  if (role === 'user')
    return (
      <Message align="end">
        <MessageContent className="items-end gap-1">
          {data.attachments && <MessagePhotos attachments={data.attachments} photoUrl={photoUrl} />}
          {text && (
            <Bubble align="end" className={userBubble}>
              <BubbleContent>
                <p className={messageTextClass}>{text}</p>
              </BubbleContent>
            </Bubble>
          )}
          <MessageTime iso={createdAt} align="end" />
        </MessageContent>
      </Message>
    )
  if (role === 'agent' && data.step) return <StepItem status={status} step={data.step} />
  if (status === 'pending')
    return (
      <Message>
        <MessageContent>
          <Bubble variant="muted" className={agentBubble}>
            <BubbleContent aria-label="Эвал думает">
              <span className="shimmer motion-reduce:shimmer-none" aria-hidden>
                Эвал думает…
              </span>
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  return (
    <Message>
      <MessageContent className="gap-1">
        {role === 'owner' && <MessageHeader className="px-0">Владелец отеля</MessageHeader>}
        {text && (
          <Bubble variant="muted" className={agentBubble}>
            <BubbleContent>
              <p className={messageTextClass}>{text}</p>
            </BubbleContent>
          </Bubble>
        )}
        {data.unverified && (
          <Bubble variant="muted" className={agentBubble}>
            <BubbleContent>
              <Badge className="mb-1.5">
                <TriangleAlert aria-hidden />
                Не проверено
              </Badge>
              <p className={messageTextClass}>{data.unverified}</p>
            </BubbleContent>
          </Bubble>
        )}
        {data.plan && <PlanView plan={data.plan} onChoose={onChoose} />}
        {status === 'failed' && onRetry ? (
          <MessageFooter className="px-0">
            <Button variant="outline" size="sm" shape="pill" onClick={onRetry}>
              <RotateCcw className="size-4" aria-hidden />
              Повторить
            </Button>
          </MessageFooter>
        ) : (
          <MessageTime iso={createdAt} />
        )}
        {actions}
      </MessageContent>
    </Message>
  )
}

const STEP_STATUS = {
  pending: {
    icon: LoaderCircle,
    label: 'выполняется',
    line: 'running',
    circle: 'bg-muted text-muted-foreground [&_svg]:motion-safe:animate-spin',
  },
  done: { icon: Check, label: 'готово', line: undefined, circle: 'bg-success-soft text-success-foreground' },
  failed: { icon: X, label: 'не удалось', line: 'error', circle: 'bg-destructive/10 text-destructive' },
} as const

/** A step of one of Eval's agents: a card of the tool with its status in a circle, the feed's width. */
function StepItem({ status, step }: { status: ChatMessage['status']; step: NonNullable<ChatMessage['data']['step']> }) {
  const { icon: Icon, label, line, circle } = STEP_STATUS[status]
  return (
    <Trace className={`rounded-2xl bg-card px-3 py-2.5 ${cardShadow}`}>
      <TraceLine status={line} className="w-full gap-3 data-[status=error]:text-muted-foreground">
        <TraceIcon className={`size-8 rounded-full ${circle}`}>
          <Icon />
        </TraceIcon>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px]/[normal] font-semibold tracking-[0.06em] uppercase">Инструмент</span>
          <span className="sr-only">Шаг {label}: </span>
          <TraceTitle
            className={`text-sm/[1.35] whitespace-normal text-foreground ${status === 'pending' ? 'shimmer' : ''}`}
          >
            {step.title}
            {status === 'pending' ? '…' : step.result ? ` — ${step.result}` : ''}
          </TraceTitle>
        </span>
      </TraceLine>
    </Trace>
  )
}

interface PlanProps {
  plan: Plan
  onChoose: ChooseSearch
}

/**
 * The plan of Eval's answer: its atmosphere and dates, the hotel cards in a row that scrolls sideways, then Eval's
 * word on why each fits — told from the plan, not kept in the chat.
 */
function PlanView({ plan, onChoose }: PlanProps) {
  const ids = plan.options.flatMap((o) => (o.hotel ? [o.hotel.id] : []))
  const state = useHotels(ids.length > 0 ? { ids } : null)
  const full = new Map(state.status === 'done' ? state.hotels.map((h) => [h.id, h]) : [])
  if (plan.options.length === 0)
    return (
      <Bubble variant="muted" className={agentBubble}>
        <BubbleContent>
          <p className={messageTextClass}>Не нашёл подходящих вариантов — попробуйте описать поездку иначе.</p>
        </BubbleContent>
      </Bubble>
    )
  return (
    <>
      <Bubble variant="muted" className={agentBubble}>
        <BubbleContent className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="w-full text-xs/[normal] tracking-[0.06em] text-muted-foreground uppercase">
              Атмосфера поездки
            </span>
            <span className="text-xl/none" aria-hidden>
              {plan.emoji}
            </span>
            <strong className="font-bold">{plan.atmosphere}</strong>
          </p>
          <p className={messageTextClass}>{plan.why}</p>
          <p className="text-sm/[normal] text-muted-foreground">
            {formatDateRange(plan.query.checkIn, plan.query.checkOut)} · {nightsLabel(plan.nights)} ·{' '}
            {guestsLabel(plan.query.guests)}
          </p>
        </BubbleContent>
      </Bubble>
      <HotelRow plan={plan} full={state.status === 'loading' ? undefined : full} onChoose={onChoose} />
      <PlanComment plan={plan} full={full} />
      {plan.overBudget && (
        <p className="px-1 text-sm/[normal] text-muted-foreground">
          В бюджет не уложился — показал самые близкие варианты. Можно сократить поездку.
        </p>
      )}
    </>
  )
}

interface HotelRowProps extends PlanProps {
  /** The full hotels once loaded: the cards need their photos, distance and rates; `undefined` while loading. */
  full: ReadonlyMap<string, Hotel> | undefined
}

/** The cards in a row, all of one width: swiped on phones, scrolled with the arrow on wider screens. */
function HotelRow({ plan, full, onChoose }: HotelRowProps) {
  const row = useRef<HTMLUListElement>(null)
  return (
    <div className="relative">
      <ul
        ref={row}
        aria-label="Отели"
        className="-mx-0.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-0.5 pt-0.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {plan.options.map((option) => (
          <li
            key={option.hotel?.id ?? option.destination.id}
            className="flex w-[clamp(240px,70vw,280px)] flex-none snap-start"
          >
            <OptionCard option={option} full={full} plan={plan} onChoose={onChoose} />
          </li>
        ))}
      </ul>
      {plan.options.length > 1 && (
        <Button
          variant="outline"
          size="icon"
          shape="pill"
          className="absolute top-[30%] -right-1 z-20 bg-card shadow-(--shadow-card) max-sm:hidden"
          aria-label="Следующие отели"
          onClick={() => row.current?.scrollBy({ left: row.current.clientWidth * 0.8, behavior: 'smooth' })}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      )}
    </div>
  )
}

interface OptionCardProps extends HotelRowProps {
  option: AssistantOption
}

/**
 * An option of the plan: the site's hotel card with the price for the stay, leading to the hotel's page on the plan's
 * dates. A city without a hotel leads to its search; a hotel that did not load, to its page.
 */
function OptionCard({ option, full, plan, onChoose }: OptionCardProps) {
  const { destination, hotel: summary, total } = option
  const hotel = summary && full?.get(summary.id)
  const stay = { total, nights: plan.nights, guests: plan.query.guests }
  if (hotel)
    return (
      <HotelTile hotel={hotel} href={hotelHref(hotel.id, plan.query)} stay={stay} heading="h4" className="w-full" />
    )
  if (summary && !full)
    return (
      <div
        role="status"
        aria-label={`Загружаю «${summary.name}»`}
        className="flex w-full flex-col gap-3 rounded-2xl bg-card p-2 shadow-(--shadow-card)"
      >
        <span className="block aspect-[4/3] w-full rounded-xl bg-muted motion-safe:animate-pulse" />
        <span className="mx-2 h-5 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
        <span className="mx-2 mb-2 h-4 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
      </div>
    )
  const search = () => onChoose({ ...plan.query, destination: destination.name })
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-2xl bg-card p-2 shadow-(--shadow-card)">
      <span className="block aspect-[4/3] w-full rounded-xl bg-muted" />
      <div className="flex flex-1 flex-col gap-1 px-2 pt-3 pb-1">
        <h4 className="text-[17px]/[1.25] font-bold">{summary?.name ?? destination.name}</h4>
        <button
          type="button"
          className="flex items-center gap-1.5 text-left text-sm/[1.35] text-muted-foreground hover:text-primary"
          aria-label={`Искать в городе ${destination.name} на эти даты`}
          onClick={search}
        >
          <MapPin className="size-4 flex-none" aria-hidden />
          <span className="min-w-0 truncate">{destination.name}</span>
          <Search className="size-3.5 flex-none" aria-hidden />
        </button>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="min-w-0">
            <span className="block text-lg/tight font-bold whitespace-nowrap">{formatPrice(total)}</span>
            <span className="block text-xs/[normal] text-muted-foreground">
              за {nightsLabel(plan.nights)} · {guestsLabel(plan.query.guests)}
            </span>
          </p>
          {summary ? (
            <Link
              href={hotelHref(summary.id, plan.query)}
              className={buttonVariants({ size: 'sm', shape: 'pill', className: 'flex-none' })}
              aria-label={`Выбрать «${summary.name}»`}
            >
              Выбрать
            </Link>
          ) : (
            <Button size="sm" shape="pill" className="flex-none" onClick={search}>
              Выбрать
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/** «Парковка», «Номера с видом на море»: at most two real features of the hotel, none without data. */
function featureLines(option: AssistantOption, hotel: Hotel | undefined): { icon: typeof Car; text: string }[] {
  const lines: { icon: typeof Car; text: string }[] = []
  if (hotel?.amenities.includes('parking')) lines.push({ icon: Car, text: 'Парковка' })
  else if (hotel?.amenities.includes('parking-nearby')) lines.push({ icon: Car, text: 'Парковка рядом' })
  const view = option.views?.[0]
  // The view is of some room types, as their names say; a reason of the wish for a view tells it already.
  const told = option.reasons?.some((reason) => reason.includes(' вид'))
  if (view && !told) lines.push({ icon: Eye, text: `Номера с видом ${VIEW_LABEL[view]}` })
  return lines.slice(0, 2)
}

/**
 * Eval's word after the cards: a line a hotel — its name, why it fits, its real features and «выше бюджета» over the
 * traveller's budget. A hotel with nothing to tell has no line; with no lines there is no message.
 */
function PlanComment({ plan, full }: { plan: Plan; full: ReadonlyMap<string, Hotel> }) {
  const lines = plan.options.flatMap((option) => {
    const features = featureLines(option, option.hotel && full.get(option.hotel.id))
    const reasons = option.reasons ?? []
    if (reasons.length === 0 && features.length === 0 && option.fitsBudget) return []
    return [{ option, reasons, features }]
  })
  if (lines.length === 0) return null
  return (
    <Bubble variant="muted" className={agentBubble}>
      <BubbleContent>
        <ul aria-label="Почему эти отели" className="flex flex-col gap-2">
          {lines.map(({ option, reasons, features }) => (
            <li key={option.hotel?.id ?? option.destination.id} className="flex flex-col gap-0.5 leading-[1.45]">
              <p>
                <strong className="font-bold">{option.hotel?.name ?? option.destination.name}</strong>
                {reasons.length > 0 && ' — '}
                {reasons.map((reason, i) => (
                  <Fragment key={reason}>
                    {i > 0 && ', '}
                    <span>{reason}</span>
                  </Fragment>
                ))}
                {!option.fitsBudget && (
                  <Badge variant="destructive" className="ml-1.5 bg-card align-middle ring-1 ring-destructive/40">
                    выше бюджета
                  </Badge>
                )}
              </p>
              {features.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm/[1.35] text-muted-foreground">
                  {features.map(({ icon: Icon, text }) => (
                    <span key={text} className="flex items-center gap-1.5">
                      <Icon className="size-4 flex-none" aria-hidden />
                      {text}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </BubbleContent>
    </Bubble>
  )
}
