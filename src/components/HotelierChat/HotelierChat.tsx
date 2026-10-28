'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, use, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BellRing, SendHorizontal } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { messageTime } from '@/lib/assistantChatList'
import { MAX_HOTELIER_MESSAGE, STATUS_LABEL, senderLabel, type HotelierMessage } from '@/lib/hotelierChat'
import { RunSources } from '../AssistantPage/ChatCards'
import { DemoBadge } from '../DemoBadge'
import { useHotelierChat, type HotelierChat as Chat } from './useHotelierChat'

const HotelierChatContext = createContext<Chat | null>(null)

/** The traveller's chat with the hotel's hotelier, read once for the cards of the page that show it. */
export function HotelierChatProvider({ hotelId, children }: { hotelId: string; children: ReactNode }) {
  return <HotelierChatContext value={useHotelierChat(hotelId)}>{children}</HotelierChatContext>
}

function useHotelierChatContext(): Chat {
  const chat = use(HotelierChatContext)
  if (!chat) throw new Error('HotelierChat needs a HotelierChatProvider')
  return chat
}

/** The count of the hotelier's answers the traveller has not read, for the tab; nothing when there are none. */
export function HotelierUnread() {
  const unread = useHotelierChatContext().conversation?.userUnread ?? 0
  if (unread === 0) return null
  return (
    <span className="ml-1.5 inline-flex min-w-4 justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">
      {unread}
      <span className="sr-only"> новых</span>
    </span>
  )
}

function Bubble({ message }: { message: HotelierMessage }) {
  const own = message.sender === 'user'
  return (
    <div className={cn('flex max-w-[88%] flex-col gap-0.5', own ? 'items-end self-end' : 'items-start self-start')}>
      {(!own || message.demo) && (
        <span className="px-1 text-xs font-semibold text-muted-foreground">
          {!own && senderLabel(message.sender, 'user')}
          {message.demo && <DemoBadge className={own ? undefined : 'ml-1.5'} />}
        </span>
      )}
      <p
        className={cn(
          'rounded-2xl px-3 py-2 text-sm/[1.4] whitespace-pre-wrap break-words',
          own ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
        )}
      >
        {message.text}
      </p>
      {message.run && (
        <div className="w-full rounded-xl bg-muted px-3 pb-1">
          <RunSources result={message.run.result} label="Источники ответа AI-помощника" />
        </div>
      )}
      <time dateTime={message.createdAt} className="px-1 text-[11px] text-muted-foreground">
        {messageTime(message.createdAt)}
      </time>
    </div>
  )
}

/**
 * «Отельер» on the hotel's page: the traveller writes to the hotel and its hotelier answers in person. The history is
 * the traveller's own and apart from the chat with Эвал; a guest is asked to sign in. `visible`: the tab is shown, so
 * the answers that came are read. `fill`: on the page «Мои чаты» the chat takes the room it has, under a header of
 * that page's own.
 */
export function HotelierChat({
  className,
  visible = true,
  fill = false,
}: {
  className?: string
  visible?: boolean
  fill?: boolean
}) {
  const { state, conversation, messages, sending, sendError, send, read } = useHotelierChatContext()
  const pathname = usePathname()
  const [text, setText] = useState('')
  const inputId = useId()
  const titleId = useId()
  const log = useRef<HTMLDivElement>(null)

  const unread = conversation?.userUnread ?? 0
  useEffect(() => {
    if (visible && unread > 0) read()
  }, [visible, unread, read])
  // The newest message in sight.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages.length])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (await send(text.trim())) setText('')
  }

  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-3', fill && 'min-h-0 flex-1', className)}>
      <header className={cn('flex items-center gap-3', fill && 'sr-only')}>
        <span
          className="flex size-12 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground-strong"
          aria-hidden
        >
          <BellRing className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg/tight font-bold">
            Отельер
          </h2>
          <p className="text-sm/snug text-muted-foreground">Ответит лично, когда будет на связи</p>
        </div>
        {conversation && conversation.status !== 'open' && (
          <Badge className="ml-auto" variant={conversation.status === 'resolved' ? 'success' : 'secondary'}>
            {STATUS_LABEL[conversation.status]}
          </Badge>
        )}
      </header>

      {state === 'guest' ? (
        <div className="flex flex-col items-start gap-2 rounded-xl bg-muted px-3.5 py-3 text-[15px]/[1.45]">
          <p className="text-muted-foreground-strong">Войдите, чтобы написать отельеру: ответ придёт сюда.</p>
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className={buttonVariants({ size: 'sm', shape: 'pill' })}
          >
            Войти
          </Link>
        </div>
      ) : state === 'loading' ? (
        <p className="rounded-xl bg-muted px-3.5 py-3 text-[15px]/[1.45] text-muted-foreground">Загружаем чат…</p>
      ) : state === 'error' ? (
        <p role="alert" className="rounded-xl bg-muted px-3.5 py-3 text-[15px]/[1.45]">
          Чат с отельером сейчас недоступен.
        </p>
      ) : messages.length > 0 ? (
        <div
          ref={log}
          role="log"
          aria-label="Чат с отельером"
          className={cn('flex flex-col gap-2 overflow-y-auto overscroll-contain', fill ? 'min-h-0 flex-1' : 'max-h-72')}
        >
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
        </div>
      ) : (
        <p
          className={cn(
            'rounded-xl bg-muted px-3.5 py-3 text-[15px]/[1.45] text-muted-foreground-strong',
            fill && 'flex-1',
          )}
        >
          Спросите отель о том, чего нет в описании: балкон, вид, этаж, тишина. Отельер ответит здесь.
        </p>
      )}

      {state === 'ready' && (
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-3 focus-within:ring-3 focus-within:ring-ring/50"
        >
          <label htmlFor={inputId} className="sr-only">
            Сообщение отельеру
          </label>
          <input
            id={inputId}
            value={text}
            maxLength={MAX_HOTELIER_MESSAGE}
            enterKeyHint="send"
            autoComplete="off"
            placeholder="Напишите отельеру…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground-strong"
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            shape="pill"
            className="size-9 flex-none"
            aria-label="Отправить отельеру"
            disabled={!text.trim() || sending}
          >
            <SendHorizontal className="size-4.5" aria-hidden />
          </Button>
        </form>
      )}
      {sendError && (
        <p role="alert" className="text-sm text-destructive">
          {sendError}
        </p>
      )}
    </section>
  )
}
