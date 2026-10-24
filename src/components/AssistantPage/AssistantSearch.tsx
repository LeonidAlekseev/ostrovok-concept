import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronRight, MapPin, Mic, RefreshCw, SendHorizontal, SlidersHorizontal } from 'lucide-react'
import { cn } from 'cn'
import { Button, buttonVariants } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { useToday } from '@/hooks/useToday'
import type { HotelSummary } from '@/lib/catalog'
import { MAX_MESSAGE_LENGTH, presetChips, type Plan } from '../../lib/assistant'
import { lastPlan, planMapHref, recentRequests, tripLine, tripParams } from '../../lib/assistantChatList'
import { isPending } from '../../lib/assistantChats'
import { todayIso } from '../../lib/dates'
import { useDestinations } from '../Catalog/useDestinations'
import { glassPanel } from '../SearchPanel/glass'
import { ChatHeader } from './ChatHeader'
import { ChatList } from './ChatList'
import { Feed, type ChooseSearch } from './ChatFeed'
import { TripDialog, TripPanel } from './TripPanel'
import { backToList, goToChat, useChatPath } from './useChatPath'
import { useChats } from './useChats'
import { useSpeech } from './useSpeech'

interface Props {
  /** The "recently added" hotels the plan's options suggest. */
  newHotels: readonly HotelSummary[]
  onChoose: ChooseSearch
}

/** Light glass over the window's glass: the composer and the quick replies. */
const glassField =
  'bg-(--glass-field) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_75%,transparent)] [backdrop-filter:blur(12px)]'
/** The bubble of the opening line, its tail at the lower left pointing at Eval. */
const bubbleClass = [
  'relative min-w-0 flex-1 rounded-[clamp(18px,4.6vw,32px)] bg-(--glass-plaque) px-[clamp(14px,3.6vw,34px)] py-[clamp(12px,3vw,26px)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--decor-light)_85%,transparent),0_8px_24px_color-mix(in_srgb,var(--decor-assistant-glow)_18%,transparent)]',
  "before:absolute before:right-[calc(100%_-_1px)] before:bottom-[24%] before:h-[clamp(12px,3vw,22px)] before:w-[clamp(8px,2.2vw,16px)] before:bg-(--glass-plaque) before:[clip-path:polygon(100%_0,100%_100%,0_100%)] before:content-['']",
].join(' ')
const actionClass = `h-9 flex-none gap-1.5 bg-(--decor-light) px-3 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_70%,transparent)] hover:text-primary [&_svg]:text-primary`

/**
 * Eval's chats on `/assistant`. From `lg` the whole screen: the chats on the left, the open chat in the middle, the
 * trip, the recent requests and what Eval can do on the right. On phones the list (`/assistant`) and the chat
 * (`/assistant/<id>`) are screens of their own. The feed follows a new message only while the traveller is at its end.
 */
export function AssistantSearch({ newHotels, onChoose }: Props) {
  const destinations = useDestinations()
  const today = useToday()
  const pathId = useChatPath()
  const { chats, active, ready, signedIn, send, retry, rename, remove, setBrief } = useChats(
    destinations,
    newHotels,
    pathId,
  )
  const [text, setText] = useState('')
  const [tripOpen, setTripOpen] = useState(false)
  const inputId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const thinking = isPending(active)
  const started = active.messages.length > 0
  const question = thinking ? null : active.question
  const presets = today ? presetChips(destinations, today) : []
  const trip = tripParams(active, destinations)
  const plan = lastPlan(active)
  const recent = recentRequests(chats)
  // Phones show the list at `/assistant` once there is a chat to list; the chat otherwise.
  const screen = pathId || (ready && chats.length === 0) ? 'chat' : 'list'

  // Wider screens open the newest chat at `/assistant`, so a reload keeps the dialog; phones show the list there.
  const opened = useRef(false)
  useEffect(() => {
    if (!ready || opened.current) return
    opened.current = true
    if (!pathId && chats[0] && isWide()) goToChat(chats[0].id, { replace: true })
  }, [ready, pathId, chats])

  const submit = (value: string, options?: { more?: boolean }) => {
    if (!ready || thinking || !value.trim()) return
    // A new chat gets its address with the first message.
    if (pathId !== active.id) goToChat(active.id)
    send(value, options)
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
    goToChat(chatId)
    setText('')
  }

  const fresh = () => {
    // A new chat has an address of its own on phones (its screen) and none on wider screens until it starts.
    goToChat(isWide() ? null : crypto.randomUUID())
    setText('')
    inputRef.current?.focus()
  }

  const removeActive = () => {
    const index = chats.findIndex((c) => c.id === active.id)
    const next = chats[index + 1] ?? chats[index - 1]
    remove(active.id)
    goToChat(next?.id ?? null, { replace: true })
  }

  const speech = useSpeech((words) => setText((value) => (value.trim() ? `${value.trimEnd()} ${words}` : words)))
  const viewport = useVisualViewportHeight()

  const planActions = (shown: Plan) => {
    const city = trip.city ?? shown.options[0]?.destination
    return (
      <div
        role="group"
        aria-label="Что дальше"
        className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none]"
      >
        {shown.options.some((o) => o.hotel) && (
          <Link href={planMapHref(shown)} className={cn(buttonVariants({ shape: 'pill' }), actionClass)}>
            <MapPin className="size-4" aria-hidden />
            Показать на карте
          </Link>
        )}
        <Button shape="pill" className={actionClass} onClick={() => setTripOpen(true)}>
          <CalendarDays className="size-4" aria-hidden />
          Изменить даты
        </Button>
        {city && (
          <Button
            shape="pill"
            className={actionClass}
            onClick={() =>
              onChoose({
                destination: city.name,
                checkIn: trip.checkIn ?? shown.query.checkIn,
                checkOut: trip.checkOut ?? shown.query.checkOut,
                guests: trip.guests ?? shown.query.guests,
              })
            }
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Фильтры
          </Button>
        )}
        <Button
          shape="pill"
          className={actionClass}
          disabled={thinking || !ready}
          onClick={() => submit('Покажи другие варианты', { more: true })}
        >
          <RefreshCw className="size-4" aria-hidden />
          Другие варианты
        </Button>
      </div>
    )
  }

  return (
    <div
      data-assistant-app={screen}
      className="grid min-h-0 flex-1 gap-4 [--glass-field:color-mix(in_srgb,var(--decor-light)_60%,transparent)] [--glass-plaque:color-mix(in_srgb,var(--decor-light)_72%,transparent)] max-lg:data-[assistant-app=chat]:h-(--chat-screen,100dvh) grid-cols-[minmax(0,1fr)] lg:h-full lg:grid-cols-[clamp(228px,19vw,290px)_minmax(0,1fr)_clamp(240px,21vw,320px)] xl:gap-5"
      // The phone's keyboard is open: the chat fits above it.
      style={viewport && screen === 'chat' ? ({ '--chat-screen': `${viewport}px` } as CSSProperties) : undefined}
    >
      <ChatList
        chats={chats}
        activeId={started || pathId ? active.id : null}
        ready={ready}
        onChoose={choose}
        onNew={fresh}
        className={`${glassPanel} rounded-[28px] p-3 lg:p-4 ${screen === 'chat' ? 'max-lg:hidden' : ''}`}
      />

      <section
        aria-label="Чат с Эвалом"
        className={`${glassPanel} flex min-h-0 min-w-0 flex-col gap-3 p-[clamp(12px,3vw,20px)] max-lg:pt-[max(12px,env(safe-area-inset-top))] max-lg:pb-[max(12px,env(safe-area-inset-bottom))] lg:rounded-[28px] ${screen === 'list' ? 'max-lg:hidden' : ''}`}
      >
        {started ? (
          <ChatHeader
            key={active.id}
            chat={active}
            trip={tripLine(trip)}
            signedIn={signedIn}
            onBack={backToList}
            onRename={(title) => rename(active.id, title)}
            onDelete={removeActive}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {chats.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 self-start lg:hidden"
                aria-label="Назад к чатам"
                onClick={backToList}
              >
                <ChevronRight className="size-5 rotate-180" aria-hidden />
                Чаты
              </Button>
            )}
            <div className="flex items-center gap-[clamp(14px,4vw,30px)] lg:mt-[clamp(8px,6vh,64px)]">
              <EvalPortrait />
              {/* The reply bubble: its tail points at Eval. */}
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
            </div>
          </div>
        )}

        {started ? (
          <Feed
            chatId={active.id}
            messages={active.messages}
            onChoose={onChoose}
            onRetry={(messageId) => retry(active.id, messageId)}
            planActions={planActions}
          />
        ) : (
          <div className="flex-1" />
        )}

        {question ? (
          <ul
            className="-mx-1 flex flex-none gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Быстрые ответы"
          >
            {question.replies.map((label) => (
              <li key={label}>
                <Button
                  variant="secondary"
                  shape="pill"
                  className={`h-10 px-4 text-[15px] font-normal text-foreground ${glassField} hover:bg-(--decor-light)`}
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
                      className="h-[clamp(54px,12vw,104px)] w-full object-cover"
                    />
                    {/* The glass plaque rises over the bottom of the photo. */}
                    <span className="relative mx-[clamp(4px,1.2vw,10px)] -mt-[clamp(16px,4.4vw,30px)] mb-[clamp(4px,1.2vw,10px)] flex items-center gap-[clamp(4px,1.4vw,12px)] rounded-full bg-(--glass-plaque) py-[clamp(6px,1.8vw,12px)] pr-[clamp(6px,1.6vw,10px)] pl-[clamp(8px,2.2vw,16px)] shadow-[inset_0_0_0_1px_var(--decor-light)] [backdrop-filter:blur(12px)]">
                      <span className="text-[clamp(14px,3.4vw,24px)] leading-none" aria-hidden>
                        {emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[clamp(13px,3.2vw,18px)] leading-[1.2] font-semibold">
                        {label}
                      </span>
                      <span
                        className="grid size-[clamp(24px,4vw,32px)] flex-none place-items-center rounded-full bg-(--decor-light) text-(--decor-assistant-text-2) shadow-[0_1px_4px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)] max-sm:hidden"
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
            className={`h-auto items-end gap-2 rounded-[24px] border-0 p-1.5 pl-4 ${glassField} bg-(--decor-light)/90 transition-shadow duration-200 has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:shadow-[inset_0_0_0_2px_var(--ring),0_0_0_4px_color-mix(in_srgb,var(--ring)_25%,transparent)]`}
          >
            <label htmlFor={inputId} className="sr-only">
              Опишите поездку
            </label>
            {/* The group draws the box and the focus state; the textarea is bare inside it and grows with the text. */}
            <InputGroupTextarea
              ref={inputRef}
              id={inputId}
              className="max-h-[min(9.5rem,30dvh)] min-h-[2.6em] self-center overflow-y-auto p-0 py-2 text-base leading-[1.4] field-sizing-content placeholder:text-(--decor-assistant-text-2)"
              rows={1}
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
            <InputGroupAddon align="inline-end" className="gap-1.5 p-0">
              {speech.supported && (
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  className="size-11 flex-none rounded-full p-0 text-foreground aria-pressed:bg-destructive/10 aria-pressed:text-destructive"
                  aria-label={speech.listening ? 'Остановить диктовку' : 'Надиктовать сообщение'}
                  aria-pressed={speech.listening}
                  onClick={speech.toggle}
                >
                  <Mic className={`size-5 ${speech.listening ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
                </InputGroupButton>
              )}
              <InputGroupButton
                type="submit"
                variant="default"
                className="size-11 flex-none rounded-full bg-(image:--decor-assistant-send) p-0 shadow-(--decor-assistant-send-glow) disabled:opacity-60"
                aria-label="Отправить"
                disabled={!text.trim() || thinking || !ready}
              >
                <SendHorizontal className="size-5" aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {speech.error && (
            <p className="mt-1.5 px-2 text-sm text-destructive" role="alert">
              {speech.error}
            </p>
          )}
        </form>
      </section>

      <TripPanel
        trip={trip}
        plan={plan}
        recent={recent}
        busy={thinking || !ready}
        onEdit={() => setTripOpen(true)}
        onAsk={(request) => submit(request)}
        className="max-lg:hidden"
      />

      <TripDialog
        open={tripOpen}
        onOpenChange={setTripOpen}
        brief={active.brief}
        trip={trip}
        destinations={destinations}
        today={today ?? todayIso()}
        onSave={(brief) => setBrief(active.id, brief)}
      />
    </div>
  )
}

/** `lg` and wider: the three columns (a browser without media queries counts as wide). */
const isWide = () => !window.matchMedia || window.matchMedia('(min-width: 980px)').matches

/**
 * The height of the visual viewport while it is smaller than the layout's (the phone's keyboard is open), so the
 * chat shrinks above the keyboard and the composer stays in view; `undefined` otherwise.
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

/** Eval's portrait over the start of a chat: a glowing rim behind the cut-out picture and sparkles. */
function EvalPortrait() {
  return (
    <div className="relative isolate size-[clamp(64px,14vw,140px)] flex-none">
      {/* The rim sits behind the picture: the palm and the hat stick out of its circle. */}
      <span
        className="absolute inset-[5%] -z-10 rounded-full shadow-[0_0_0_clamp(2px,0.5vw,4px)_color-mix(in_srgb,var(--decor-light)_85%,transparent),0_0_clamp(12px,3.4vw,34px)_color-mix(in_srgb,var(--decor-assistant-glow)_80%,transparent)]"
        aria-hidden
      />
      <Image src="/assistant/eval.webp" alt="Эвал" width={256} height={256} preload className="size-full" />
      <span
        className="pointer-events-none absolute -top-[10%] -left-[8%] text-(--decor-gold) drop-shadow-[0_0_6px_color-mix(in_srgb,var(--decor-star)_70%,transparent)] motion-safe:animate-pulse"
        aria-hidden
      >
        <span className="block text-[clamp(16px,4.4vw,34px)] leading-none">✦</span>
        <span className="-mt-[0.2em] -ml-[0.5em] block text-[clamp(9px,2.4vw,18px)] leading-none">✦</span>
      </span>
    </div>
  )
}
