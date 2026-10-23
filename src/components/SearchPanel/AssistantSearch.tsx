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
/** Light glass over the window's glass: the composer and the quick replies. */
const glassField =
  'bg-(--glass-field) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_75%,transparent)] [backdrop-filter:blur(12px)]'
/** The bubble of the opening line, its tail at the lower left pointing at Eval. */
const bubbleClass = [
  'relative min-w-0 flex-1 rounded-[clamp(18px,4.6vw,32px)] bg-(--glass-plaque) px-[clamp(14px,3.6vw,34px)] py-[clamp(12px,3vw,26px)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--decor-light)_85%,transparent),0_8px_24px_color-mix(in_srgb,var(--decor-assistant-glow)_18%,transparent)]',
  "before:absolute before:right-[calc(100%_-_1px)] before:bottom-[24%] before:h-[clamp(12px,3vw,22px)] before:w-[clamp(8px,2.2vw,16px)] before:bg-(--glass-plaque) before:[clip-path:polygon(100%_0,100%_100%,0_100%)] before:content-['']",
].join(' ')

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

  return (
    <div className="flex flex-col gap-[clamp(12px,3vw,20px)] [--glass-field:color-mix(in_srgb,var(--decor-light)_60%,transparent)] [--glass-plaque:color-mix(in_srgb,var(--decor-light)_72%,transparent)]">
      <div className={`flex items-center ${started ? 'gap-3' : 'gap-[clamp(14px,4vw,30px)]'}`}>
        <EvalPortrait started={started} />
        {started ? (
          <h2 className="min-w-0 flex-1 text-[clamp(15px,4vw,18px)] leading-[1.25] font-bold tracking-[-0.01em]">
            О каком путешествии вы мечтаете?
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
        {started && (
          <Button
            variant="secondary"
            size="sm"
            shape="pill"
            className="flex-none bg-(--glass-field) max-sm:w-9 max-sm:justify-center max-sm:p-0"
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

      {question ? (
        // Bleeds to the window edge: the strip scrolls under the padding (--pad from SearchPanel).
        <ul
          className="-mx-(--pad) flex gap-2 overflow-x-auto px-(--pad) py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Быстрые ответы"
        >
          {question.replies.map((label) => (
            <li key={label}>
              <Button
                variant="secondary"
                shape="pill"
                className={`h-[clamp(40px,10.6vw,48px)] px-[clamp(14px,3.6vw,20px)] text-[clamp(14px,3.7vw,16px)] font-normal text-foreground ${glassField} hover:bg-(--decor-light)`}
                onClick={() => send(label)}
                disabled={thinking}
              >
                {label}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        !started && (
          <ul className="grid grid-cols-3 gap-[clamp(8px,2.4vw,22px)]" aria-label="Идеи для поездки">
            {starterChips.map(({ emoji, label, photo }) => (
              <li key={label} className="min-w-0">
                <button
                  type="button"
                  className="group flex w-full flex-col overflow-hidden rounded-[clamp(16px,4.4vw,30px)] bg-(--glass-field) text-left shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_80%,transparent),0_6px_20px_color-mix(in_srgb,var(--decor-assistant-glow)_35%,transparent)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1.5px_var(--decor-light),0_10px_26px_color-mix(in_srgb,var(--decor-assistant-glow)_50%,transparent)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
                  onClick={() => send(label)}
                  disabled={thinking}
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

      <form
        className={`relative flex items-center gap-[clamp(10px,2.6vw,18px)] rounded-[clamp(18px,4.8vw,30px)] p-[clamp(8px,2.2vw,14px)] pl-[clamp(14px,3.6vw,26px)] ${glassField} transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_2px_var(--ring),0_0_0_4px_color-mix(in_srgb,var(--ring)_25%,transparent)]`}
        onSubmit={onSubmit}
      >
        <Sparkles
          className="size-[clamp(22px,6vw,30px)] flex-none fill-current text-(--decor-assistant-spark) drop-shadow-[0_0_6px_color-mix(in_srgb,var(--decor-assistant-spark)_55%,transparent)]"
          aria-hidden
        />
        <span
          className="w-px self-stretch bg-[color-mix(in_srgb,var(--decor-assistant-text-2)_25%,transparent)]"
          aria-hidden
        />
        <label htmlFor={inputId} className="sr-only">
          Опишите поездку
        </label>
        {/* The composer draws the box and the focus state; the textarea is bare inside it. */}
        <Textarea
          id={inputId}
          className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-base leading-[1.4] field-sizing-fixed placeholder:text-(--decor-assistant-text-2) focus-visible:border-0 focus-visible:ring-0 sm:text-lg md:text-lg"
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
        <Button
          type="submit"
          size="icon"
          className="size-[clamp(48px,13vw,68px)] flex-none bg-(image:--decor-assistant-send) shadow-(--decor-assistant-send-glow) disabled:opacity-60"
          aria-label="Отправить"
          disabled={!text.trim() || thinking}
        >
          <SendHorizontal className="size-[42%]" aria-hidden />
        </Button>
      </form>
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

/** Eval's portrait over the conversation: a glowing rim behind the cut-out picture and sparkles before the start. */
function EvalPortrait({ started }: { started: boolean }) {
  return (
    <div className={`relative isolate flex-none ${started ? 'size-12' : 'size-[clamp(64px,17vw,168px)]'}`}>
      {/* The rim sits behind the picture: the palm and the hat stick out of its circle. */}
      <span
        className="absolute inset-[5%] -z-10 rounded-full shadow-[0_0_0_clamp(2px,0.5vw,4px)_color-mix(in_srgb,var(--decor-light)_85%,transparent),0_0_clamp(12px,3.4vw,34px)_color-mix(in_srgb,var(--decor-assistant-glow)_80%,transparent)]"
        aria-hidden
      />
      <Image src={avatarSrc} alt={started ? '' : 'Эвал'} width={256} height={256} priority className="size-full" />
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
  return <Image src={avatarSrc} alt="" width={64} height={64} className={messageAvatarClass} />
}
