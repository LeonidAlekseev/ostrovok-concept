import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ArrowDown,
  Check,
  ChevronRight,
  LoaderCircle,
  MessagesSquare,
  Plus,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
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
import { useToday } from '@/hooks/useToday'
import { isRated, type HotelSummary } from '@/lib/catalog'
import { hotelHref } from '@/lib/search'
import { MAX_MESSAGE_LENGTH, presetChips, type AssistantOption, type Plan } from '../../lib/assistant'
import { isPending, type Chat, type ChatMessage } from '../../lib/assistantChats'
import { formatDateRange } from '../../lib/dates'
import { countRu, formatPrice, guestsLabel } from '../../lib/format'
import { useDestinations } from '../Catalog/useDestinations'
import { useChats } from './useChats'

interface Props {
  /** The "recently added" hotels the plan's options suggest. */
  newHotels: readonly HotelSummary[]
  onChoose: HotelSearch['searchFor']
}

/** The agent's bubble; with a plan it takes the full width, on a lighter surface. */
const agentBubble =
  'max-w-[min(100%,560px)] *:data-[slot=bubble-content]:rounded-[18px_18px_18px_6px] *:data-[slot=bubble-content]:px-3.5 *:data-[slot=bubble-content]:py-2.5 *:data-[slot=bubble-content]:text-base has-data-[slot=plan]:w-full has-data-[slot=plan]:max-w-full has-data-[slot=plan]:*:data-[slot=bubble-content]:w-full has-data-[slot=plan]:*:data-[slot=bubble-content]:bg-(--decor-surface-soft)'
const userBubble =
  'max-w-[85%] *:data-[slot=bubble-content]:rounded-[18px_18px_6px] *:data-[slot=bubble-content]:px-3.5 *:data-[slot=bubble-content]:py-2.5 *:data-[slot=bubble-content]:text-base'
/** Phones hide the agent's avatar: the bubbles need the width. */
const messageAvatarClass = 'size-8 flex-none bg-transparent max-sm:hidden'
const messageTextClass = 'leading-[1.45] whitespace-pre-wrap'
const avatarSrc = '/assistant/eval.webp'
const hintClass = 'block text-xs/[normal] font-normal text-muted-foreground'
/** Light glass over the window's glass: the composer and the quick replies. */
const glassField =
  'bg-(--glass-field) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_75%,transparent)] [backdrop-filter:blur(12px)]'
/** The bubble of the opening line, its tail at the lower left pointing at Eval. */
const bubbleClass = [
  'relative min-w-0 flex-1 rounded-[clamp(18px,4.6vw,32px)] bg-(--glass-plaque) px-[clamp(14px,3.6vw,34px)] py-[clamp(12px,3vw,26px)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--decor-light)_85%,transparent),0_8px_24px_color-mix(in_srgb,var(--decor-assistant-glow)_18%,transparent)]',
  "before:absolute before:right-[calc(100%_-_1px)] before:bottom-[24%] before:h-[clamp(12px,3vw,22px)] before:w-[clamp(8px,2.2vw,16px)] before:bg-(--glass-plaque) before:[clip-path:polygon(100%_0,100%_100%,0_100%)] before:content-['']",
].join(' ')

/**
 * Eval's chats on `/assistant`: the list of chats beside the open one (behind «Чаты» on phones), the feed of the open
 * chat with the steps of Eval's agents and its answers, and the composer pinned under it. The feed follows a new
 * message only while the traveller is at its end; otherwise a button leads to it.
 */
export function AssistantSearch({ newHotels, onChoose }: Props) {
  const destinations = useDestinations()
  const today = useToday()
  const { chats, active, ready, send, retry, open, startNew } = useChats(destinations, newHotels)
  const [text, setText] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const inputId = useId()
  const listId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const thinking = isPending(active)
  const started = active.messages.length > 0
  const question = thinking ? null : active.question
  const presets = today ? presetChips(destinations, today) : []

  const submit = (value: string) => {
    if (!ready || thinking || !value.trim()) return
    send(value)
    setText('')
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit(text)
  }

  // Enter sends, Shift+Enter breaks the line; an IME composition is never cut short.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit(text)
    }
  }

  const choose = (chatId: string) => {
    open(chatId)
    setListOpen(false)
    setText('')
  }

  const fresh = () => {
    startNew()
    setListOpen(false)
    setText('')
    inputRef.current?.focus()
  }

  const viewport = useVisualViewportHeight()
  const unreadElsewhere = chats.some((c) => c.id !== active.id && c.unread)

  return (
    <div
      className={`flex min-h-0 gap-[clamp(12px,2vw,24px)] [--glass-field:color-mix(in_srgb,var(--decor-light)_60%,transparent)] [--glass-plaque:color-mix(in_srgb,var(--decor-light)_72%,transparent)] ${started || chats.length > 0 ? 'h-(--chat-height,80dvh) min-h-[min(420px,var(--chat-height,80dvh))]' : ''}`}
      // The phone's keyboard is open: the chat fits above it (the page's padding leaves the window's own).
      style={viewport ? { height: `calc(${viewport}px - 2 * var(--pad, 0px))`, minHeight: 0 } : undefined}
    >
      {chats.length > 0 && (
        <ChatList
          id={listId}
          chats={chats}
          activeId={active.id}
          open={listOpen}
          onChoose={choose}
          onNew={fresh}
          onClose={() => setListOpen(false)}
        />
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-[clamp(12px,3vw,20px)]" aria-label="Чат с Эвалом">
        <div className={`flex items-center ${started ? 'gap-3' : 'gap-[clamp(14px,4vw,30px)]'}`}>
          <EvalPortrait started={started} />
          {started ? (
            <h2 className="line-clamp-2 min-w-0 flex-1 text-[clamp(15px,4vw,18px)] leading-[1.25] font-bold tracking-[-0.01em]">
              {active.title || 'О каком путешествии вы мечтаете?'}
            </h2>
          ) : (
            // The reply bubble: its tail points at Eval.
            <div className={bubbleClass}>
              <h2 className="text-(length:--text-heading) leading-[1.2] font-bold tracking-[-0.01em]">
                О каком путешествии вы мечтаете?{' '}
                <span className="whitespace-nowrap" aria-hidden>
                  🌴
                </span>
              </h2>
              <p className="mt-[clamp(4px,1.2vw,10px)] text-[clamp(14px,3.7vw,20px)] leading-[1.4] text-(--decor-assistant-text-2)">
                Я подберу идеальное жильё, направление и лучшие варианты для вашего отдыха <span aria-hidden>✨</span>
              </p>
            </div>
          )}
          <div className="flex flex-none gap-2 self-start">
            {chats.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                shape="pill"
                className="relative bg-(--glass-field) max-sm:w-9 max-sm:justify-center max-sm:p-0 lg:hidden"
                aria-expanded={listOpen}
                aria-controls={listId}
                onClick={() => setListOpen((value) => !value)}
              >
                <MessagesSquare className="size-4" aria-hidden />
                <span className="max-sm:sr-only">Чаты</span>
                {unreadElsewhere && (
                  <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-destructive" aria-hidden />
                )}
              </Button>
            )}
            {started && (
              <Button
                variant="secondary"
                size="sm"
                shape="pill"
                // The desktop has the list's own «Новый чат».
                className={`bg-(--glass-field) max-sm:w-9 max-sm:justify-center max-sm:p-0 ${chats.length > 0 ? 'lg:hidden' : ''}`}
                onClick={fresh}
              >
                <Plus className="size-4" aria-hidden />
                {/* Phones show the icon only; the label stays as the button's accessible name. */}
                <span className="max-sm:sr-only">Новый чат</span>
              </Button>
            )}
          </div>
        </div>

        {started && <Feed chat={active} onChoose={onChoose} onRetry={retry} />}

        {question ? (
          // Bleeds to the window edge: the strip scrolls under the padding (--pad from AssistantPage).
          <ul
            className="-mx-(--pad) flex flex-none gap-2 overflow-x-auto px-(--pad) py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Быстрые ответы"
          >
            {question.replies.map((label) => (
              <li key={label}>
                <Button
                  variant="secondary"
                  shape="pill"
                  className={`h-[clamp(40px,10.6vw,48px)] px-[clamp(14px,3.6vw,20px)] text-[clamp(14px,3.7vw,16px)] font-normal text-foreground ${glassField} hover:bg-(--decor-light)`}
                  onClick={() => submit(label)}
                  disabled={thinking || !ready}
                >
                  {label}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          !started &&
          presets.length > 0 && (
            <ul className="grid grid-cols-3 gap-[clamp(8px,2.4vw,22px)]" aria-label="Идеи для поездки">
              {presets.map(({ emoji, label, photo }) => (
                <li key={label} className="min-w-0">
                  <button
                    type="button"
                    className="group flex w-full flex-col overflow-hidden rounded-[clamp(16px,4.4vw,30px)] bg-(--glass-field) text-left shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_80%,transparent),0_6px_20px_color-mix(in_srgb,var(--decor-assistant-glow)_35%,transparent)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1.5px_var(--decor-light),0_10px_26px_color-mix(in_srgb,var(--decor-assistant-glow)_50%,transparent)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
                    onClick={() => submit(label)}
                    disabled={thinking || !ready}
                  >
                    <Image
                      src={photo}
                      alt=""
                      width={310}
                      height={70}
                      className="h-[clamp(54px,15vw,104px)] w-full object-cover"
                    />
                    {/* The glass plaque rises over the bottom of the photo. */}
                    <span className="relative mx-[clamp(4px,1.2vw,10px)] -mt-[clamp(16px,4.4vw,30px)] mb-[clamp(4px,1.2vw,10px)] flex items-center gap-[clamp(4px,1.4vw,12px)] rounded-full bg-(--glass-plaque) py-[clamp(6px,1.8vw,12px)] pr-[clamp(6px,1.6vw,10px)] pl-[clamp(8px,2.2vw,16px)] shadow-[inset_0_0_0_1px_var(--decor-light)] [backdrop-filter:blur(12px)]">
                      <span className="text-[clamp(14px,4vw,26px)] leading-none" aria-hidden>
                        {emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[clamp(13px,3.6vw,20px)] leading-[1.2] font-semibold">
                        {label}
                      </span>
                      <span
                        className="grid size-[clamp(24px,5vw,36px)] flex-none place-items-center rounded-full bg-(--decor-light) text-(--decor-assistant-text-2) shadow-[0_1px_4px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)] max-sm:hidden"
                        aria-hidden
                      >
                        <ChevronRight className="size-[60%]" />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        <form className="flex-none" onSubmit={onSubmit}>
          <InputGroup
            className={`h-auto items-end gap-[clamp(10px,2.6vw,18px)] rounded-[clamp(18px,4.8vw,30px)] border-0 p-[clamp(8px,2.2vw,14px)] pl-[clamp(14px,3.6vw,26px)] ${glassField} transition-shadow duration-200 has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:shadow-[inset_0_0_0_2px_var(--ring),0_0_0_4px_color-mix(in_srgb,var(--ring)_25%,transparent)]`}
          >
            <InputGroupAddon align="inline-start" className="order-first gap-[clamp(10px,2.6vw,18px)] self-stretch p-0">
              <Sparkles
                className="size-[clamp(22px,6vw,30px)] flex-none fill-current text-(--decor-assistant-spark) drop-shadow-[0_0_6px_color-mix(in_srgb,var(--decor-assistant-spark)_55%,transparent)]"
                aria-hidden
              />
              <span
                className="w-px self-stretch bg-[color-mix(in_srgb,var(--decor-assistant-text-2)_25%,transparent)]"
                aria-hidden
              />
            </InputGroupAddon>
            <label htmlFor={inputId} className="sr-only">
              Опишите поездку
            </label>
            {/* The group draws the box and the focus state; the textarea is bare inside it and grows with the text. */}
            <InputGroupTextarea
              ref={inputRef}
              id={inputId}
              className="max-h-[min(9.5rem,30dvh)] min-h-[2.8em] self-center overflow-y-auto p-0 text-base leading-[1.4] field-sizing-content placeholder:text-(--decor-assistant-text-2) sm:text-lg md:text-lg"
              rows={2}
              value={text}
              enterKeyHint="send"
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={
                started
                  ? 'Ответьте или уточните пожелания…'
                  : 'Например: «Хочу на море в октябре, спокойный отдых, с ребёнком»'
              }
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <InputGroupAddon align="inline-end" className="p-0">
              <InputGroupButton
                type="submit"
                variant="default"
                className="size-[clamp(48px,13vw,68px)] flex-none rounded-full bg-(image:--decor-assistant-send) p-0 shadow-(--decor-assistant-send-glow) disabled:opacity-60"
                aria-label="Отправить"
                disabled={!text.trim() || thinking || !ready}
              >
                <SendHorizontal className="size-[42%]" aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </section>
    </div>
  )
}

/**
 * The height of the visual viewport while it is smaller than the layout's (the phone's keyboard is open), so the
 * window shrinks above the keyboard and the composer stays in view; `undefined` otherwise.
 */
function useVisualViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const onResize = () => {
      const keyboard = window.innerHeight - viewport.height > 120
      setHeight(keyboard ? Math.round(viewport.height) : undefined)
      if (keyboard && document.activeElement instanceof HTMLTextAreaElement)
        document.activeElement.scrollIntoView({ block: 'nearest' })
    }
    viewport.addEventListener('resize', onResize)
    return () => viewport.removeEventListener('resize', onResize)
  }, [])
  return height
}

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' })

/** «15:30» today, «23 окт.» before. */
function chatDate(iso: string): string {
  const date = new Date(iso)
  return date.toDateString() === new Date().toDateString() ? timeFormat.format(date) : dateFormat.format(date)
}

interface ChatListProps {
  id: string
  chats: readonly Chat[]
  activeId: string
  /** Shown on phones and tablets; the desktop always shows it. */
  open: boolean
  onChoose: (chatId: string) => void
  onNew: () => void
  onClose: () => void
}

/** The chats, newest first, with the title, the date and a mark of a new or a pending answer. */
function ChatList({ id, chats, activeId, open, onChoose, onNew, onClose }: ChatListProps) {
  return (
    <nav
      id={id}
      aria-label="Чаты"
      className={`${open ? 'flex' : 'hidden'} absolute inset-(--pad) z-10 flex-col gap-2 rounded-[clamp(18px,4.8vw,30px)] bg-(--decor-surface-soft) p-3 shadow-(--shadow-card) lg:static lg:inset-auto lg:z-auto lg:flex lg:w-[clamp(220px,20vw,280px)] lg:flex-none lg:bg-(--glass-field) lg:shadow-none`}
    >
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" shape="pill" className="flex-1" onClick={onNew}>
          <Plus className="size-4" aria-hidden />
          Новый чат
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Закрыть список чатов"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <ul className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1">
        {chats.map((chat) => {
          const pending = isPending(chat)
          return (
            <li key={chat.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-(--decor-light) aria-[current=true]:bg-(--decor-light) aria-[current=true]:shadow-[inset_0_0_0_1.5px_var(--ring)]"
                aria-current={chat.id === activeId}
                onClick={() => onChoose(chat.id)}
              >
                <span className="line-clamp-2 text-sm/[1.3] font-semibold">{chat.title || 'Новый чат'}</span>
                <span className="flex items-center gap-1.5 text-xs/[normal] text-muted-foreground">
                  {chatDate(chat.updatedAt)}
                  {chat.unread && <Badge className="h-4 px-1.5 text-[11px]">новое</Badge>}
                  {pending && (
                    <span className="inline-flex items-center gap-1">
                      <LoaderCircle className="size-3 motion-safe:animate-spin" aria-hidden />
                      ждёт ответа
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

interface FeedProps {
  chat: Chat
  onChoose: Props['onChoose']
  onRetry: (chatId: string, messageId: string) => void
}

/**
 * The open chat's messages in the Message Scroller of shadcn/ui. A chat opens at its end; the feed follows a new
 * message only while the traveller is at the end, and the traveller's own message settles at the top. Reading the
 * older messages, they get a button to the new one instead of a jump.
 */
function Feed({ chat, onChoose, onRetry }: FeedProps) {
  return (
    // A new provider per chat: each opens at its own end.
    <MessageScrollerProvider key={chat.id} autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1">
        <MessageScrollerViewport aria-label="Лента чата" className="px-0.5 pt-0.5 pb-1">
          <MessageScrollerContent aria-label="Диалог с Эвалом" className="gap-2.5">
            {chat.messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === 'user'}
                data-step={message.role === 'agent' && message.data.step ? message.status : undefined}
                className="animate-in duration-250 ease-out fade-in slide-in-from-bottom-[6px]"
              >
                <MessageItem message={message} onChoose={onChoose} onRetry={() => onRetry(chat.id, message.id)} />
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
  onChoose: Props['onChoose']
  onRetry: () => void
}

function MessageItem({ message, onChoose, onRetry }: MessageProps) {
  const { role, status, text, data } = message
  if (role === 'user')
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" className={userBubble}>
            <BubbleContent>
              <p className={messageTextClass}>{text}</p>
            </BubbleContent>
          </Bubble>
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
        <Bubble variant="muted" className={agentBubble}>
          <BubbleContent>
            {text && <p className={messageTextClass}>{text}</p>}
            {data.plan && <PlanView plan={data.plan} onChoose={onChoose} />}
          </BubbleContent>
        </Bubble>
        {status === 'failed' && (
          <MessageFooter className="px-0">
            <Button variant="outline" size="sm" shape="pill" onClick={onRetry}>
              <RotateCcw className="size-4" aria-hidden />
              Повторить
            </Button>
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  )
}

const STEP_STATUS = {
  pending: { icon: LoaderCircle, label: 'выполняется', line: 'running', className: 'motion-safe:animate-spin' },
  done: { icon: Check, label: 'готово', line: undefined, className: 'text-brand-foreground' },
  failed: { icon: X, label: 'не удалось', line: 'error', className: '' },
} as const

/** A step of one of Eval's agents: a trace line of its own with the status, under Eval's avatar column. */
function StepItem({ status, step }: { status: ChatMessage['status']; step: NonNullable<ChatMessage['data']['step']> }) {
  const { icon: Icon, label, line, className } = STEP_STATUS[status]
  return (
    <Trace className="pl-10 max-sm:pl-1">
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
  onChoose: Props['onChoose']
}

function PlanView({ plan, onChoose }: PlanProps) {
  const nights = countRu(plan.nights, ['ночь', 'ночи', 'ночей'])
  if (plan.options.length === 0)
    return (
      <div data-slot="plan" className="flex flex-col gap-2 not-first:mt-2.5">
        <p className={messageTextClass}>Не нашёл подходящих вариантов — попробуйте описать поездку иначе.</p>
      </div>
    )
  return (
    <div data-slot="plan" className="flex flex-col gap-2 not-first:mt-2.5">
      <p className="flex items-center gap-3 rounded-xl bg-[linear-gradient(120deg,var(--secondary),var(--decor-mint))] px-3 py-2.5">
        <span className="text-3xl/none" aria-hidden>
          {plan.emoji}
        </span>
        <span>
          <span className="block text-xs/[normal] tracking-[0.06em] text-muted-foreground uppercase">
            Атмосфера поездки
          </span>
          <strong className="block text-lg/[normal] font-bold">{plan.atmosphere}</strong>
        </span>
      </p>
      <p className={messageTextClass}>{plan.why}</p>
      <p className="text-sm/[normal] text-muted-foreground">
        {formatDateRange(plan.query.checkIn, plan.query.checkOut)} · {nights} · {guestsLabel(plan.query.guests)}
      </p>
      <ul className="grid grid-cols-1 gap-1.5">
        {plan.options.map((option) => (
          <li key={option.hotel?.id ?? option.destination.id}>
            <HotelOptionCard option={option} plan={plan} nights={nights} onChoose={onChoose} />
          </li>
        ))}
      </ul>
      {plan.overBudget && (
        <p className="text-sm/[normal] text-muted-foreground">
          В бюджет не уложился — показал самые близкие варианты. Можно сократить поездку.
        </p>
      )}
    </div>
  )
}

interface HotelOptionCardProps {
  option: AssistantOption
  plan: Plan
  /** «5 ночей». */
  nights: string
  onChoose: Props['onChoose']
}

/**
 * The card of an option inside Eval's message: the city with its search on the plan's dates, the hotel with why it
 * fits and the total, and a link to the hotel's page on the same dates.
 */
function HotelOptionCard({ option, plan, nights, onChoose }: HotelOptionCardProps) {
  const { destination, hotel, total, fitsBudget, reasons } = option
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-200 has-[button:hover]:border-primary has-[button:hover]:shadow-[0_4px_14px_color-mix(in_srgb,var(--primary)_12%,transparent)] has-focus-visible:border-primary">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 py-2.5 pr-2 pl-3 text-left"
        onClick={() => onChoose({ ...plan.query, destination: destination.name })}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-[650]">
            {destination.name}
            <span className="ml-1.5 text-sm/[normal] font-normal text-muted-foreground">{destination.country}</span>
          </span>
          {hotel && (
            <span className="block truncate text-sm/[normal] text-muted-foreground">
              {hotel.name}
              {isRated(hotel) && (
                <Badge className="ml-1.5 gap-0.5">
                  <Star fill="currentColor" strokeWidth={0} aria-hidden />
                  {hotel.rating.toFixed(1)}
                </Badge>
              )}
            </span>
          )}
          {/* Why the hotel fits the traveller's conditions, or that there is no data to tell. */}
          {reasons?.map((reason) => (
            <span key={reason} className="block text-xs/[1.35] text-foreground">
              {reason}
            </span>
          ))}
        </span>
        <span className="flex-none text-right font-[650] whitespace-nowrap">
          {formatPrice(total)}
          {fitsBudget ? (
            <span className={hintClass}>за {nights}</span>
          ) : (
            <Badge variant="destructive" className="mt-0.5 ml-auto flex">
              выше бюджета
            </Badge>
          )}
        </span>
        <ChevronRight className="size-5 flex-none text-brand-foreground" aria-hidden />
      </button>
      {hotel && (
        <Link
          href={hotelHref(hotel.id, plan.query)}
          className="flex items-center gap-1 border-t border-border px-3 py-2 text-sm/[normal] font-semibold text-primary hover:text-primary-hover"
        >
          Об отеле «{hotel.name}»
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </article>
  )
}

/** Eval's portrait over the conversation: a glowing rim behind the cut-out picture and sparkles before the start. */
function EvalPortrait({ started }: { started: boolean }) {
  return (
    <div className={`relative isolate flex-none ${started ? 'size-12' : 'size-[clamp(64px,17vw,168px)]'}`}>
      {/* The rim sits behind the picture: the palm and the hat stick out of its circle. */}
      <span
        className="absolute inset-[5%] -z-10 rounded-full shadow-[0_0_0_clamp(2px,0.5vw,4px)_color-mix(in_srgb,var(--decor-light)_85%,transparent),0_0_clamp(12px,3.4vw,34px)_color-mix(in_srgb,var(--decor-assistant-glow)_80%,transparent)]"
        aria-hidden
      />
      <Image src={avatarSrc} alt={started ? '' : 'Эвал'} width={256} height={256} preload className="size-full" />
      {!started && (
        <span
          className="pointer-events-none absolute -top-[10%] -left-[8%] text-(--decor-gold) drop-shadow-[0_0_6px_color-mix(in_srgb,var(--decor-star)_70%,transparent)] motion-safe:animate-pulse"
          aria-hidden
        >
          <span className="block text-[clamp(16px,4.4vw,34px)] leading-none">✦</span>
          <span className="-mt-[0.2em] -ml-[0.5em] block text-[clamp(9px,2.4vw,18px)] leading-none">✦</span>
        </span>
      )}
    </div>
  )
}

function EvalAvatar() {
  return (
    <MessageAvatar className={messageAvatarClass}>
      <Image src={avatarSrc} alt="" width={64} height={64} className="size-full" />
    </MessageAvatar>
  )
}
