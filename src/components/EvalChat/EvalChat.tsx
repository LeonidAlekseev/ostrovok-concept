'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, use, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { RotateCcw, SendHorizontal, TriangleAlert } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { MAX_MESSAGE_LENGTH } from '@/lib/assistant'
import { isPending, newId, type Chat, type ChatMessage } from '@/lib/assistantChats'
import { useDestinations } from '../Catalog/useDestinations'
import { Feed } from '../AssistantPage/ChatFeed'
import { MapMessage } from '../AssistantPage/MapMessage'
import { useChats, type Chats, type HotelContext, type TripsContext } from '../AssistantPage/useChats'

/** The newest messages the compact card shows; the whole dialog is in Эвал's chat. */
const SHOWN_MESSAGES = 4

const NO_HOTELS: [] = []

/** The messages of the compact card: the traveller's and Эвал's, without the steps of agents. */
const shownMessages = (messages: readonly ChatMessage[]) =>
  messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-SHOWN_MESSAGES)

function Bubble({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  const { role, status, text, data } = message
  if (role === 'user')
    return (
      <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm/[1.4] whitespace-pre-wrap text-primary-foreground">
        {text}
      </p>
    )
  if (status === 'pending')
    return (
      <p className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm/[1.4]">
        <span className="shimmer motion-reduce:shimmer-none">Эвал думает…</span>
      </p>
    )
  return (
    <div className="flex max-w-[92%] flex-col items-start gap-1.5 self-start">
      <p className="rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm/[1.4] whitespace-pre-wrap">{text}</p>
      {data.unverified && (
        <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm/[1.4]">
          <Badge className="mb-1 bg-card">
            <TriangleAlert aria-hidden />
            Не проверено
          </Badge>
          <p className="whitespace-pre-wrap">{data.unverified}</p>
        </div>
      )}
      {data.map && <MapMessage map={data.map} compact className="[&_figcaption]:text-[13px]" />}
      {status === 'failed' && (
        <Button variant="outline" size="sm" shape="pill" onClick={onRetry}>
          <RotateCcw className="size-4" aria-hidden />
          Повторить
        </Button>
      )}
    </div>
  )
}

const EvalChatContext = createContext<Chats | null>(null)

/**
 * The chat of a page's cards with Эвал, read and saved once for all of them: the hotel's (`HotelContext`) or the
 * bookings' (`TripsContext`). The page continues the newest chat `previous` finds among the traveller's chats; the chat
 * is created with the first question.
 */
export function EvalChatProvider({
  scope,
  previous,
  children,
}: {
  scope: HotelContext | TripsContext
  previous: (chats: readonly Chat[]) => Chat | undefined
  children: ReactNode
}) {
  const destinations = useDestinations()
  const [draftId] = useState(newId)
  const [continued, setContinued] = useState<string | null>(null)
  const chats = useChats(destinations, NO_HOTELS, continued ?? draftId, scope)
  // The chat the traveller had here before is continued.
  const before = previous(chats.chats)?.id
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the chat follows the page's newest one once the chats are read
    if (before) setContinued(before)
  }, [before])
  return <EvalChatContext value={chats}>{children}</EvalChatContext>
}

export interface EvalChatProps {
  className?: string
  /** «Помощник по этому отелю». */
  subtitle: string
  /** Эвал's first words before the dialog. */
  greeting: string
  /** The ready-made questions. */
  questions: readonly string[]
  /** The field's label for a screen reader: «Вопрос об отеле». */
  inputLabel: string
  /**
   * The whole feed of the chat — the blocks of the tools with their sources and the proposals to confirm — instead of
   * the latest messages: the side panel.
   */
  feed?: boolean
}

/**
 * «Эвал» on a page: the greeting, the ready-made questions, a field and the chat — its latest messages in a card, or
 * its whole feed in the side panel (`feed`). The chat is one of the traveller's chats with Эвал: it is in their list,
 * and «Открыть в Эвале» opens it whole.
 */
export function EvalChat({ className, subtitle, greeting, questions, inputLabel, feed }: EvalChatProps) {
  const chats = use(EvalChatContext)
  if (!chats) throw new Error('EvalChat needs an EvalChatProvider')
  const { active, ready, send, retry, flush, confirmChange, photoUrl } = chats
  const router = useRouter()
  const [text, setText] = useState('')
  const inputId = useId()
  const titleId = useId()

  const thinking = isPending(active)
  const messages = shownMessages(active.messages)
  const started = active.messages.length > 0
  const ask = (value: string) => {
    if (!ready || thinking || !value.trim()) return
    send(value)
    setText('')
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    ask(text)
  }

  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-3', className)}>
      <header className="flex items-center gap-3">
        <span className="relative size-12 flex-none rounded-full bg-[color-mix(in_srgb,var(--decor-assistant-sky)_45%,var(--decor-light))]">
          <Image src="/assistant/eval.webp" alt="" width={96} height={96} className="size-full" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg/tight font-bold">
            Эвал
          </h2>
          <p className="text-sm/snug text-muted-foreground">{subtitle}</p>
        </div>
        {started && (
          <Link
            href={`/assistant/${encodeURIComponent(active.id)}`}
            // The chat of a signed-in traveller is written to the account first: the page of Эвал reads it from there.
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return
              event.preventDefault()
              const href = event.currentTarget.getAttribute('href')!
              void flush().then(() => router.push(href))
            }}
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              shape: 'pill',
              className: cn('ml-auto flex-none', feed && 'mr-9'),
            })}
          >
            Открыть в Эвале
          </Link>
        )}
      </header>

      {started && feed ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Feed
            chatId={active.id}
            messages={active.messages}
            photoUrl={photoUrl}
            onChoose={() => ({})}
            onRetry={(messageId) => retry(active.id, messageId)}
            onConfirmChange={(messageId) => confirmChange(active.id, messageId)}
          />
        </div>
      ) : messages.length > 0 ? (
        <div
          role="log"
          aria-label="Диалог с Эвалом"
          className="flex max-h-72 flex-col gap-2 overflow-y-auto overscroll-contain"
        >
          {messages.map((message) => (
            <Bubble key={message.id} message={message} onRetry={() => retry(active.id, message.id)} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-muted px-3.5 py-3 text-[15px]/[1.45] text-muted-foreground-strong">{greeting}</p>
      )}
      {feed && !started && <div className="flex-1" />}

      <ul className="flex flex-wrap gap-2" aria-label="Готовые вопросы">
        {questions.map((question) => (
          <li key={question}>
            <Button
              variant="secondary"
              shape="pill"
              size="sm"
              className="h-auto min-h-8 bg-muted px-3 py-1.5 text-sm font-normal whitespace-normal text-muted-foreground-strong hover:bg-[var(--brand-line)]"
              disabled={thinking || !ready}
              onClick={() => ask(question)}
            >
              {question}
            </Button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-3 focus-within:ring-3 focus-within:ring-ring/50"
      >
        <label htmlFor={inputId} className="sr-only">
          {inputLabel}
        </label>
        <input
          id={inputId}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          enterKeyHint="send"
          autoComplete="off"
          placeholder="Задайте любой вопрос…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground-strong"
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          shape="pill"
          className="size-9 flex-none"
          aria-label="Отправить"
          disabled={!text.trim() || thinking || !ready}
        >
          <SendHorizontal className="size-4.5" aria-hidden />
        </Button>
      </form>
    </section>
  )
}
