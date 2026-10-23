import Image from 'next/image'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronRight, RotateCcw, SendHorizontal, Sparkles, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { HotelSearch } from '@/hooks/useHotelSearch'
import type { HotelSummary } from '@/lib/catalog'
import {
  MAX_MESSAGE_LENGTH,
  askAssistant,
  briefPersona,
  describeBrief,
  makePlan,
  nextQuestion,
  starterChips,
  type Brief,
  type Plan,
  type Question,
} from '../../lib/assistant'
import { formatDateRange, todayIso } from '../../lib/dates'
import { countRu, formatPrice, guestsLabel } from '../../lib/format'
import { bestRoute, type RouteCardData } from '../../lib/routes'
import { useDestinations } from '../Catalog/useDestinations'
import { ReadyRoute } from '../RouteCard/ReadyRoute'
import { loadDialog, saveDialog, type DialogMessage } from '../../lib/assistantDialog'

type Message = DialogMessage

interface Props {
  /** The "recently added" hotels the plan's options suggest. */
  newHotels: readonly HotelSummary[]
  /** The routes the plan picks its ready-made one from. */
  routes: readonly RouteCardData[]
  onChoose: HotelSearch['searchFor']
}

/** The shortest pause before the assistant replies, so the answer reads as a reply rather than an echo. */
const THINK_MS = 650

const messageClass =
  'flex items-end gap-2 animate-in fade-in slide-in-from-bottom-[6px] animation-duration-250 ease-out'
const agentBubble = 'min-w-0 max-w-[min(100%,560px)] rounded-[18px_18px_18px_6px] bg-muted px-3.5 py-2.5'
const userBubble = 'min-w-0 max-w-[85%] rounded-[18px_18px_6px] bg-primary px-3.5 py-2.5 text-primary-foreground'
/** Phones hide the agent's avatar: the bubbles need the width. */
const messageAvatarClass = 'size-8 flex-none max-sm:hidden'
const messageTextClass = 'leading-[1.45] whitespace-pre-wrap'
const avatarSrc = '/assistant/eval.webp'
const hintClass = 'block text-xs/[normal] font-normal text-muted-foreground'

export function AssistantSearch({ newHotels, routes, onChoose }: Props) {
  const destinations = useDestinations()
  const [messages, setMessages] = useState<Message[]>([])
  const [brief, setBrief] = useState<Brief>({})
  const [question, setQuestion] = useState<Question | null>(null)
  // Restored after mount from sessionStorage: reading it during render would break hydration.
  const [hydrated, setHydrated] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [text, setText] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** Cancels the pending reply on "Заново" and on unmount. */
  const pendingRef = useRef<AbortController>(undefined)
  const logRef = useRef<HTMLOListElement>(null)
  const inputId = useId()

  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      pendingRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    const saved = loadDialog()
    if (saved) {
      // oxlint-disable-next-line react/set-state-in-effect -- sessionStorage exists only on the client
      setMessages(saved.messages)
      setBrief(saved.brief)
      setQuestion(saved.question)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveDialog({ messages, brief, question })
  }, [hydrated, messages, brief, question])

  // Keep the newest message in view inside the log (not the page: that would yank the scroll).
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, thinking])

  const send = (raw: string) => {
    const wish = raw.trim()
    if (!wish || thinking) return
    setText('')
    const history = [...messages, { from: 'user', text: wish } satisfies Message]
    setMessages(history)
    setThinking(true)
    pendingRef.current?.abort()
    const pending = new AbortController()
    pendingRef.current = pending
    const reply = askAssistant(
      {
        messages: history.map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', text: m.text })),
        brief,
      },
      question?.id ?? null,
      destinations,
      pending.signal,
    )
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const { brief: next, reply: remark, matches, routeId } = await reply
      if (pending.signal.aborted) return
      setBrief(next)
      const today = todayIso()
      const ask = nextQuestion(next, today)
      const understood = describeBrief(next, destinations)
      setThinking(false)
      setQuestion(ask)
      if (ask) {
        // The model's remark fills in only when nothing is understood yet, so answers keep "Записал: …".
        const lead = understood ? `Записал: ${understood}.` : remark
        setMessages((list) => [...list, { from: 'agent', text: lead ? `${lead} ${ask.text}` : ask.text }])
        return
      }
      const plan = makePlan(next, today, destinations, newHotels, matches)
      // The search by meaning's route, or the rules over all the traveller's words and the plan's first city.
      const words = history.flatMap((m) => (m.from === 'user' ? m.text : [])).join('. ')
      const route = bestRoute(routes, {
        semanticId: routeId,
        persona: briefPersona(next, words, plan.nights),
        destinationId: plan.options[0]?.destination.id,
      })
      setMessages((list) => [
        ...list,
        { from: 'agent', text: understood ? `Записал: ${understood}.` : '', plan, route },
      ])
    }, THINK_MS)
  }

  const reset = () => {
    clearTimeout(timerRef.current)
    pendingRef.current?.abort()
    setMessages([])
    setBrief({})
    setQuestion(null)
    setThinking(false)
    setText('')
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(text)
  }

  // Enter sends, Shift+Enter breaks the line; an IME composition is never cut short.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(text)
    }
  }

  const started = messages.length > 0
  const chips = question ? question.replies.map((label) => ({ emoji: null, label })) : starterChips

  return (
    <div className="flex flex-col gap-[clamp(12px,3vw,18px)]">
      <div className="flex items-center gap-[clamp(12px,3.4vw,22px)]">
        <Image
          src={avatarSrc}
          alt={started ? '' : 'Эвал'}
          width={256}
          height={256}
          priority
          className={`flex-none rounded-full ${started ? 'size-12' : 'size-[clamp(64px,18vw,104px)]'}`}
        />
        <div className="min-w-0 flex-1">
          <h2
            className={`leading-[1.25] font-bold tracking-[-0.01em] ${started ? 'text-[clamp(15px,4vw,18px)]' : 'text-(length:--text-heading)'}`}
          >
            О каком путешествии вы мечтаете?
          </h2>
          <p className={`mt-1.5 text-[clamp(14px,3.7vw,18px)] text-muted-foreground ${started ? 'hidden' : ''}`}>
            Я подберу идеальное жилье и направление
          </p>
        </div>
        {started && (
          <Button
            variant="secondary"
            size="sm"
            shape="pill"
            className="flex-none max-sm:w-9 max-sm:justify-center max-sm:p-0"
            onClick={reset}
          >
            <RotateCcw className="size-4" aria-hidden />
            {/* Phones show the icon only; the label stays as the button's accessible name. */}
            <span className="max-sm:sr-only">Заново</span>
          </Button>
        )}
      </div>

      {started && (
        <ol
          ref={logRef}
          className="flex max-h-[min(420px,55vh)] flex-col gap-2.5 overflow-y-auto overscroll-contain px-0.5 pt-0.5 pb-1"
          aria-live="polite"
          aria-label="Диалог с Эвалом"
        >
          {messages.map((message, i) => (
            <li key={i} className={message.from === 'user' ? `${messageClass} justify-end` : messageClass}>
              {message.from === 'agent' && <EvalAvatar />}
              {/* The agent's bubble with a plan takes the full width, on a lighter surface. */}
              <div
                className={
                  message.from === 'user'
                    ? userBubble
                    : `${agentBubble} has-data-[slot=plan]:flex-1 has-data-[slot=plan]:bg-(--decor-surface-soft)`
                }
              >
                {message.text && <p className={messageTextClass}>{message.text}</p>}
                {message.plan && <PlanView plan={message.plan} route={message.route ?? null} onChoose={onChoose} />}
              </div>
            </li>
          ))}
          {thinking && (
            <li className={messageClass}>
              <EvalAvatar />
              <div className="flex gap-1 rounded-[18px_18px_18px_6px] bg-muted px-4 py-3.5" aria-label="Эвал думает">
                {[0, 0.15, 0.3].map((delay) => (
                  <span
                    key={delay}
                    className="size-[7px] animate-typing-dot rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
            </li>
          )}
        </ol>
      )}

      <form
        className="relative flex items-center gap-[clamp(10px,2.6vw,16px)] rounded-[clamp(16px,4vw,20px)] border border-border bg-card p-[clamp(10px,2.6vw,14px)] pl-[clamp(14px,3.6vw,22px)] transition-[border-color,box-shadow] duration-200 focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_10%,transparent)]"
        onSubmit={onSubmit}
      >
        <Sparkles className="size-[clamp(22px,6vw,28px)] flex-none fill-current text-primary" aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Опишите поездку
        </label>
        {/* The composer draws the box and the focus state; the textarea is bare inside it. */}
        <Textarea
          id={inputId}
          className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-base leading-[1.4] field-sizing-fixed focus-visible:border-0 sm:text-lg md:text-lg"
          rows={2}
          value={text}
          enterKeyHint="send"
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={
            started
              ? 'Ответьте или уточните пожелания…'
              : 'Например: «Хочу на море в октябре, спокойный отдых, бюджет до 70 000 ₽»'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button
          type="submit"
          size="icon"
          className="size-[clamp(48px,13vw,64px)] flex-none shadow-(--shadow-primary)"
          aria-label="Отправить"
          disabled={!text.trim() || thinking}
        >
          <SendHorizontal className="size-[45%]" aria-hidden />
        </Button>
      </form>

      {/* Bleeds to the card edge: the strip scrolls under the panel padding (--pad from SearchPanel). */}
      <ul
        className="-mx-(--pad) flex gap-2 overflow-x-auto px-(--pad) py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={question ? 'Быстрые ответы' : 'Идеи для поездки'}
      >
        {chips.map(({ emoji, label }) => (
          <li key={label}>
            <Button
              variant="secondary"
              shape="pill"
              className="h-[clamp(40px,10.6vw,48px)] bg-(--decor-surface-soft) px-[clamp(14px,3.6vw,20px)] text-[clamp(14px,3.7vw,16px)] font-normal text-foreground hover:bg-secondary"
              onClick={() => send(label)}
              disabled={thinking}
            >
              {emoji && (
                <span className="text-[1.25em] leading-none" aria-hidden>
                  {emoji}
                </span>
              )}
              {label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface PlanProps {
  plan: Plan
  route: RouteCardData | null
  onChoose: Props['onChoose']
}

function PlanView({ plan, route, onChoose }: PlanProps) {
  const nights = countRu(plan.nights, ['ночь', 'ночи', 'ночей'])
  if (plan.options.length === 0)
    return (
      <div data-slot="plan" className="flex flex-col gap-2 not-first:mt-2.5">
        <p className={messageTextClass}>Не нашёл подходящих вариантов — попробуйте описать поездку иначе.</p>
        <ReadyRoute route={route} />
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
      <ReadyRoute route={route} />
      <ul className="grid grid-cols-1 gap-1.5">
        {plan.options.map(({ destination, hotel, total, fitsBudget }) => (
          <li key={hotel?.id ?? destination.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card py-2.5 pr-2 pl-3 text-left transition-[border-color,box-shadow] duration-200 hover:border-primary hover:shadow-[0_4px_14px_color-mix(in_srgb,var(--primary)_12%,transparent)] focus-visible:border-primary focus-visible:shadow-[0_4px_14px_color-mix(in_srgb,var(--primary)_12%,transparent)]"
              onClick={() => onChoose({ ...plan.query, destination: destination.name })}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-[650]">
                  {destination.name}
                  <span className="ml-1.5 text-sm/[normal] font-normal text-muted-foreground">
                    {destination.country}
                  </span>
                </span>
                {hotel && (
                  <span className="block truncate text-sm/[normal] text-muted-foreground">
                    {hotel.name}
                    <Badge className="ml-1.5 gap-0.5">
                      <Star fill="currentColor" strokeWidth={0} aria-hidden />
                      {hotel.rating.toFixed(1)}
                    </Badge>
                  </span>
                )}
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

function EvalAvatar() {
  return <Image src={avatarSrc} alt="" width={64} height={64} className={`${messageAvatarClass} rounded-full`} />
}
