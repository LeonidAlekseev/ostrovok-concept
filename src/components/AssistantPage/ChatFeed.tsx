import Image from 'next/image'
import Link from 'next/link'
import { useRef, type ReactNode } from 'react'
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
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import type { HotelSearch } from '@/hooks/useHotelSearch'
import { useHotels } from '@/hooks/useHotels'
import { isRated, type Hotel } from '@/lib/catalog'
import { VIEW_LABEL } from '@/lib/features'
import { ratingLabel } from '@/lib/reviews'
import { hotelHref } from '@/lib/search'
import type { AssistantOption, Plan } from '../../lib/assistant'
import { messageTime, nightsLabel } from '../../lib/assistantChatList'
import type { ChatMessage } from '../../lib/assistantChats'
import { formatDateRange } from '../../lib/dates'
import { formatDecimal, formatPrice, guestsLabel } from '../../lib/format'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { MessagePhotos, type PhotoUrl } from './ChatPhotos'

/** The agent's bubble; with a plan it takes the full width. */
const agentBubble =
  'max-w-[min(100%,560px)] *:data-[slot=bubble-content]:rounded-[18px_18px_18px_6px] *:data-[slot=bubble-content]:bg-(--decor-light) *:data-[slot=bubble-content]:px-3.5 *:data-[slot=bubble-content]:py-2.5 *:data-[slot=bubble-content]:text-base *:data-[slot=bubble-content]:shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)] has-data-[slot=plan]:w-full has-data-[slot=plan]:max-w-full has-data-[slot=plan]:*:data-[slot=bubble-content]:w-full has-data-[slot=plan]:*:data-[slot=bubble-content]:bg-transparent has-data-[slot=plan]:*:data-[slot=bubble-content]:p-0 has-data-[slot=plan]:*:data-[slot=bubble-content]:shadow-none'
const userBubble =
  'max-w-[85%] *:data-[slot=bubble-content]:rounded-[18px_18px_6px] *:data-[slot=bubble-content]:px-3.5 *:data-[slot=bubble-content]:py-2.5 *:data-[slot=bubble-content]:text-base'
/** Phones hide the agent's avatar: the bubbles need the width. */
export const messageAvatarClass = 'size-9 flex-none bg-transparent max-sm:hidden'
const messageTextClass = 'leading-[1.45] whitespace-pre-wrap'
const avatarSrc = '/assistant/eval.webp'
const timeClass = 'px-1 text-xs/[normal] text-muted-foreground'

export type ChooseSearch = HotelSearch['searchFor']

/** A shared chat has the public links of its photos and the previews that never reached Storage. */
const sharedPhotoUrl: PhotoUrl = (attachment) => attachment.url ?? attachment.preview

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
        <EvalAvatar />
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
      {role === 'owner' ? <span className={messageAvatarClass} aria-hidden /> : <EvalAvatar />}
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
        {data.plan && (
          <Bubble variant="muted" className={agentBubble}>
            <BubbleContent>
              <PlanView plan={data.plan} onChoose={onChoose} />
            </BubbleContent>
          </Bubble>
        )}
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
  pending: { icon: LoaderCircle, label: 'выполняется', line: 'running', className: 'motion-safe:animate-spin' },
  done: { icon: Check, label: 'готово', line: undefined, className: 'text-success-foreground' },
  failed: { icon: X, label: 'не удалось', line: 'error', className: '' },
} as const

/** A step of one of Eval's agents: a trace line of its own with the status, under Eval's avatar column. */
function StepItem({ status, step }: { status: ChatMessage['status']; step: NonNullable<ChatMessage['data']['step']> }) {
  const { icon: Icon, label, line, className } = STEP_STATUS[status]
  return (
    <Trace className="ml-11 w-fit max-w-[min(100%,560px)] rounded-2xl bg-(--decor-light) px-3 py-2 shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)] max-sm:ml-0">
      <TraceLine status={line} className="text-sm/[1.35]">
        <TraceIcon>
          <Icon className={className} />
        </TraceIcon>
        <span className="sr-only">Шаг {label}: </span>
        <TraceTitle className="whitespace-normal">
          {step.title}
          {status === 'pending' ? '…' : step.result ? ` — ${step.result}` : ''}
        </TraceTitle>
      </TraceLine>
    </Trace>
  )
}

interface PlanProps {
  plan: Plan
  onChoose: ChooseSearch
}

/** The plan of Eval's answer: its atmosphere, the dates and the hotel cards in a row that scrolls sideways. */
export function PlanView({ plan, onChoose }: PlanProps) {
  const nights = nightsLabel(plan.nights)
  const guests = guestsLabel(plan.query.guests)
  if (plan.options.length === 0)
    return (
      <div data-slot="plan" className="rounded-[18px] bg-(--decor-light) px-3.5 py-2.5">
        <p className={messageTextClass}>Не нашёл подходящих вариантов — попробуйте описать поездку иначе.</p>
      </div>
    )
  return (
    <div data-slot="plan" className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-[18px_18px_18px_6px] bg-(--decor-light) px-3.5 py-2.5 shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
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
          {formatDateRange(plan.query.checkIn, plan.query.checkOut)} · {nights} · {guests}
        </p>
      </div>
      <HotelRow plan={plan} nights={nights} guests={guests} onChoose={onChoose} />
      {plan.overBudget && (
        <p className="px-1 text-sm/[normal] text-muted-foreground">
          В бюджет не уложился — показал самые близкие варианты. Можно сократить поездку.
        </p>
      )}
    </div>
  )
}

interface HotelRowProps extends PlanProps {
  /** «2 ночи». */
  nights: string
  /** «2 гостя». */
  guests: string
}

/** The cards in a row: swiped on phones, scrolled with the arrow on wider screens. */
function HotelRow({ plan, nights, guests, onChoose }: HotelRowProps) {
  const row = useRef<HTMLUListElement>(null)
  const ids = plan.options.flatMap((o) => (o.hotel ? [o.hotel.id] : []))
  const state = useHotels(ids.length > 0 ? { ids } : null)
  const full = new Map(state.status === 'done' ? state.hotels.map((h) => [h.id, h]) : [])
  return (
    <div className="relative">
      <ul
        ref={row}
        aria-label="Отели"
        className="-mx-0.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-0.5 pt-0.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {plan.options.map((option) => (
          <li key={option.hotel?.id ?? option.destination.id} className="flex flex-none snap-start">
            <HotelOptionCard
              option={option}
              hotel={option.hotel && full.get(option.hotel.id)}
              plan={plan}
              nights={nights}
              guests={guests}
              onChoose={onChoose}
            />
          </li>
        ))}
      </ul>
      {plan.options.length > 1 && (
        <Button
          variant="outline"
          size="icon"
          shape="pill"
          className="absolute top-[30%] -right-1 bg-card shadow-(--shadow-card) max-sm:hidden"
          aria-label="Следующие отели"
          onClick={() => row.current?.scrollBy({ left: row.current.clientWidth * 0.8, behavior: 'smooth' })}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      )}
    </div>
  )
}

interface HotelOptionCardProps extends HotelRowProps {
  option: AssistantOption
  /** The full hotel once loaded: its photo, distance to the centre and parking. */
  hotel?: Hotel
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
 * A hotel of the plan: the photo with the favourite and the guests' rating, the name, the city (its search on the
 * plan's dates), the real features, why it fits, the total for the stay and «Выбрать» — the hotel's page on the
 * plan's dates. A city without a hotel leads to its search.
 */
function HotelOptionCard({ option, hotel, plan, nights, guests, onChoose }: HotelOptionCardProps) {
  const { destination, hotel: summary, total, fitsBudget, reasons } = option
  const titleId = `option-${summary?.id ?? destination.id}`
  const search = () => onChoose({ ...plan.query, destination: destination.name })
  return (
    <article
      aria-labelledby={titleId}
      className="flex w-[clamp(220px,64vw,248px)] flex-col overflow-hidden rounded-2xl bg-card shadow-(--shadow-card)"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {hotel?.photos[0] ? (
          <PhotoPlaceholder photo={hotel.photos[0]} className="size-full" />
        ) : (
          <span className="block size-full bg-[linear-gradient(135deg,var(--decor-photo-from),var(--decor-photo-to))]" />
        )}
        {summary && (
          <FavoriteButton
            hotelId={summary.id}
            className="absolute top-2 right-2 size-8 border-0 bg-card/90 [&_svg]:size-4.5"
          />
        )}
        {summary && isRated(summary) && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-card/95 py-0.5 pr-2.5 pl-0.5 text-xs/[normal] font-semibold">
            <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-success-foreground">
              <span className="sr-only">Оценка гостей </span>
              {formatDecimal(summary.rating)}
            </span>
            {ratingLabel(summary.rating)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h4 id={titleId} className="line-clamp-2 text-[15px]/[1.3] font-bold">
          {summary?.name ?? destination.name}
        </h4>
        <button
          type="button"
          className="flex items-center gap-1.5 text-left text-sm/[1.35] text-muted-foreground hover:text-primary"
          aria-label={`Искать в городе ${destination.name} на эти даты`}
          onClick={search}
        >
          <MapPin className="size-4 flex-none" aria-hidden />
          <span className="min-w-0 truncate">
            {hotel ? `${formatDecimal(hotel.distanceKm)} км от центра · ` : ''}
            {destination.name}
          </span>
          <Search className="size-3.5 flex-none" aria-hidden />
        </button>
        {featureLines(option, hotel).map(({ icon: Icon, text }) => (
          <p key={text} className="flex items-center gap-1.5 text-sm/[1.35] text-muted-foreground">
            <Icon className="size-4 flex-none" aria-hidden />
            {text}
          </p>
        ))}
        {/* Why the hotel fits the traveller's conditions, or that there is no data to tell. */}
        {reasons?.map((reason) => (
          <p key={reason} className="text-xs/[1.35] text-foreground">
            {reason}
          </p>
        ))}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="min-w-0">
            <span className="block text-lg/tight font-bold whitespace-nowrap">{formatPrice(total)}</span>
            {fitsBudget ? (
              <span className="block text-xs/[normal] text-muted-foreground">
                за {nights} · {guests}
              </span>
            ) : (
              <Badge variant="destructive" className="mt-0.5">
                выше бюджета
              </Badge>
            )}
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

export function EvalAvatar() {
  return (
    <MessageAvatar className={`${messageAvatarClass} self-start`}>
      <Image src={avatarSrc} alt="" width={64} height={64} className="size-full" />
    </MessageAvatar>
  )
}
