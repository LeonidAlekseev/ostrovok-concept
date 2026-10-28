import Link from 'next/link'
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { CalendarDays, MapPin, Paperclip, RefreshCw, SendHorizontal, SlidersHorizontal } from 'lucide-react'
import { cn } from 'cn'
import { Button, buttonVariants } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { useToday } from '@/hooks/useToday'
import type { HotelSummary } from '@/lib/catalog'
import { MAX_MESSAGE_LENGTH, MAX_PHOTOS, presetChips, type Plan } from '../../lib/assistant'
import { lastPlan, planMapHref, recentRequests, tripLine, tripParams } from '../../lib/assistantChatList'
import { isPending } from '../../lib/assistantChats'
import { todayIso } from '../../lib/dates'
import { PHOTO_TYPES } from '../../lib/imageOptimize'
import { useDestinations } from '../Catalog/useDestinations'
import { ChatHeader, NewChatHeader } from './ChatHeader'
import { ChatList } from './ChatList'
import { AttachedPhotos } from './ChatPhotos'
import { Feed, type ChooseSearch } from './ChatFeed'
import { TripDialog, TripPanel } from './TripPanel'
import { backToList, goToChat, useChatPath } from './useChatPath'
import { useAttachPhotos } from './useAttachPhotos'
import { useChats } from './useChats'

interface Props {
  /** The "recently added" hotels the plan's options suggest. */
  newHotels: readonly HotelSummary[]
  onChoose: ChooseSearch
}

/** The rounded, outlined panels of the three columns from `lg`; on phones the list lies on the page, the chat fills it. */
const panelClass = 'lg:rounded-[28px] lg:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_70%,transparent)]'
/** The composer and the quick replies: solid fields on the white panel. */
const fieldClass = 'bg-muted'
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
  const {
    chats,
    active,
    ready,
    signedIn,
    send,
    retry,
    confirmChange,
    rename,
    remove,
    setBrief,
    research,
    photoUrl,
    photoError,
  } = useChats(destinations, newHotels, pathId)
  const [text, setText] = useState('')
  const attach = useAttachPhotos()
  const fileRef = useRef<HTMLInputElement>(null)
  // A guest who reaches for the paperclip learns that a chat with photos is kept only after signing in.
  const [guestWarned, setGuestWarned] = useState(false)
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

  /** The field's message: its text and the photos attached, either of them may be missing. */
  const submitField = () => {
    const photos = attach.photos
    if (photos.length === 0) return submit(text)
    if (!ready || thinking || attach.busy) return
    if (pathId !== active.id) goToChat(active.id)
    send(text, { photos })
    setText('')
    attach.clear()
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submitField()
  }

  // Enter sends, Shift+Enter breaks the line; an IME composition is never cut short.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submitField()
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

  const removeChat = (id: string) => {
    if (id !== active.id) return remove(id)
    const index = chats.findIndex((c) => c.id === id)
    const next = chats[index + 1] ?? chats[index - 1]
    remove(id)
    goToChat(next?.id ?? null, { replace: true })
  }

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
      className="grid min-h-0 flex-1 gap-4 max-lg:data-[assistant-app=chat]:h-(--chat-screen,100dvh) max-lg:data-[assistant-app=chat]:flex-none max-lg:data-[assistant-app=chat]:grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)] lg:h-full lg:grid-cols-[clamp(228px,19vw,290px)_minmax(0,1fr)_clamp(240px,21vw,320px)] xl:gap-5"
      // The phone's keyboard is open: the chat fits above it.
      style={viewport && screen === 'chat' ? ({ '--chat-screen': `${viewport}px` } as CSSProperties) : undefined}
    >
      <ChatList
        chats={chats}
        activeId={started || pathId ? active.id : null}
        ready={ready}
        signedIn={signedIn}
        onChoose={choose}
        onNew={fresh}
        onRename={rename}
        onDelete={removeChat}
        className={`${panelClass} max-lg:p-0 lg:bg-(--decor-light) lg:p-4 ${screen === 'chat' ? 'max-lg:hidden' : ''}`}
      />

      <section
        aria-label="Чат с Эвалом"
        className={`${panelClass} flex min-h-0 min-w-0 flex-col gap-3 bg-(--decor-light) p-[clamp(12px,3vw,20px)] max-lg:pt-[max(12px,env(safe-area-inset-top))] max-lg:pb-[max(12px,env(safe-area-inset-bottom))] ${screen === 'list' ? 'max-lg:hidden' : ''}`}
      >
        {started ? (
          <ChatHeader
            key={active.id}
            chat={active}
            trip={tripLine(trip)}
            signedIn={signedIn}
            onBack={backToList}
            onRename={(title) => rename(active.id, title)}
            onDelete={() => removeChat(active.id)}
          />
        ) : (
          <NewChatHeader canGoBack={chats.length > 0} onBack={backToList} />
        )}

        {!started && (
          /* Eval's greeting: a grey cloud. */
          <div className="max-w-[min(100%,34rem)] self-start rounded-[18px_18px_18px_6px] bg-muted px-4 py-3 text-base/[1.45] text-foreground">
            О каком путешествии вы мечтаете? <span aria-hidden>🌴</span> Я подберу идеальное жильё, направление и лучшие
            варианты для вашего отдыха <span aria-hidden>✨</span>
          </div>
        )}

        {started ? (
          <Feed
            chatId={active.id}
            messages={active.messages}
            photoUrl={photoUrl}
            onChoose={onChoose}
            onRetry={(messageId) => retry(active.id, messageId)}
            onConfirmChange={(messageId) => confirmChange(active.id, messageId)}
            planActions={planActions}
            onResearch={(brief) => research(active.id, brief)}
            busy={thinking || !ready}
            destinations={destinations}
            today={today ?? undefined}
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
                  className={`h-10 px-4 text-[15px] font-normal text-foreground ${fieldClass} hover:bg-secondary`}
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
            <ul className="grid grid-cols-2 gap-2" aria-label="Идеи для поездки">
              {presets.map(({ emoji, label }) => (
                <li key={label} className="min-w-0">
                  <button
                    type="button"
                    className="flex h-12 w-full items-center gap-2.5 rounded-2xl bg-muted px-4 text-left text-base font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
                    onClick={() => submit(label)}
                    disabled={thinking || !ready}
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {emoji}
                    </span>
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        <form className="flex-none" onSubmit={onSubmit}>
          <AttachedPhotos photos={attach.photos} onRemove={attach.remove} />
          <div className="flex items-end gap-2">
            <InputGroup
              className={`h-auto min-h-13 flex-1 items-center gap-1 rounded-[28px] border-0 p-1 pr-4 ${fieldClass} has-disabled:bg-muted has-disabled:opacity-100 transition-shadow duration-200 has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:shadow-[inset_0_0_0_2px_var(--ring),0_0_0_4px_color-mix(in_srgb,var(--ring)_25%,transparent)]`}
            >
              <InputGroupAddon align="inline-start" className="self-end p-0">
                <input
                  ref={fileRef}
                  type="file"
                  accept={PHOTO_TYPES.join(',')}
                  multiple
                  hidden
                  aria-label="Выбрать фото"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])]
                    // The same file chosen again is a new choice.
                    e.target.value = ''
                    void attach.add(files)
                  }}
                />
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  className="size-11 flex-none rounded-full p-0 text-foreground"
                  aria-label={`Приложить фото, до ${MAX_PHOTOS}`}
                  disabled={!ready || attach.busy}
                  onClick={() => {
                    if (!signedIn) setGuestWarned(true)
                    fileRef.current?.click()
                  }}
                >
                  <Paperclip className="size-5.5" aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
              <label htmlFor={inputId} className="sr-only">
                Опишите поездку
              </label>
              {/* The group draws the box and the focus state; the textarea is bare inside it and grows with the text. */}
              <InputGroupTextarea
                ref={inputRef}
                id={inputId}
                className="max-h-[min(9.5rem,30dvh)] self-center overflow-y-auto p-0 py-2 text-base leading-[1.4] field-sizing-content placeholder:text-(--decor-assistant-text-2)"
                rows={1}
                value={text}
                enterKeyHint="send"
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Напишите, что ищете…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </InputGroup>
            <Button
              type="submit"
              size="icon"
              shape="pill"
              className="size-13 flex-none bg-primary p-0 text-primary-foreground shadow-(--shadow-primary) hover:bg-primary/90 disabled:opacity-60"
              aria-label="Отправить"
              disabled={(!text.trim() && attach.photos.length === 0) || attach.busy || thinking || !ready}
            >
              <SendHorizontal className="size-6" aria-hidden />
            </Button>
          </div>
          {(attach.error || photoError) && (
            <p className="mt-1.5 px-2 text-sm text-destructive" role="alert">
              {attach.error ?? photoError}
            </p>
          )}
          {attach.photos.length > 0 && !attach.error && (
            <p className="mt-1.5 px-2 text-xs text-muted-foreground">
              {attach.photos.length} из {MAX_PHOTOS} фото · JPEG, PNG или WebP до 10 МБ
            </p>
          )}
          {!signedIn && ready && (guestWarned || attach.photos.length > 0) && (
            <p className="mt-1.5 px-2 text-sm text-(--decor-assistant-text-2)" role="status">
              Чат с фото сохранится, только если вы войдёте.{' '}
              <Link
                href="/login?next=/assistant"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Войти
              </Link>
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
