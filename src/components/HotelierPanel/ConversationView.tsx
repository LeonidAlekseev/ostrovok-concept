'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, SendHorizontal } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { messageTime } from '@/lib/assistantChatList'
import {
  KIND_LABEL,
  MAX_HOTELIER_MESSAGE,
  REQUEST_STATUS_LABEL,
  STATUS_LABEL,
  addMessage,
  senderLabel,
  type ConversationStatus,
  type HotelierConversation,
  type HotelierMessage,
  type HotelierRequest,
} from '@/lib/hotelierChat'
import { followConversation, loadMessages, loadRequests, markRead } from '@/lib/hotelierChatRemote'
import { getBrowserClient } from '@/lib/supabase/client'

/** What the hotelier is told of a refused answer or state, by the route's status. */
const ANSWER_ERRORS: Record<number, string> = {
  403: 'Это обращение не вашего отеля',
  409: 'Обращение закрыто: откройте его снова, чтобы ответить',
  429: 'Слишком много сообщений: подождите минуту',
}
const ANSWER_ERROR = 'Не удалось отправить, попробуйте ещё раз'

function Message({ message }: { message: HotelierMessage }) {
  const own = message.sender === 'hotelier'
  return (
    <div className={cn('flex max-w-[85%] flex-col gap-0.5', own ? 'items-end self-end' : 'items-start self-start')}>
      <span className="px-1 text-xs font-semibold text-muted-foreground">
        {senderLabel(message.sender, 'hotelier')}
      </span>
      <p
        className={cn(
          'rounded-2xl px-3 py-2 text-[15px]/[1.45] whitespace-pre-wrap break-words',
          own ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
        )}
      >
        {message.text}
      </p>
      <span className="px-1 text-[11px] text-muted-foreground">
        <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
        {own && message.shareable && ' · в общих сведениях'}
      </span>
    </div>
  )
}

/** The context of Эвал's question: what is asked and why, the characteristics, the state. */
function RequestCard({ request }: { request: HotelierRequest }) {
  return (
    <section aria-label="Запрос Эвала" className="flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Запрос Эвала</span>
        <Badge variant={request.status === 'answered' ? 'success' : 'secondary'}>
          {REQUEST_STATUS_LABEL[request.status]}
        </Badge>
      </div>
      <p className="whitespace-pre-wrap">{request.question}</p>
      {request.characteristicKeys.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Запрашиваемые характеристики">
          {request.characteristicKeys.map((key) => (
            <li key={key}>
              <Badge className="font-mono font-normal">{key}</Badge>
            </li>
          ))}
        </ul>
      )}
      {request.contextSummary && (
        <p className="text-muted-foreground">
          <span className="font-semibold">Контекст: </span>
          {request.contextSummary}
        </p>
      )}
    </section>
  )
}

/**
 * One conversation in the hotelier's panel: its whole history, Эвал's requests with their characteristics, the
 * answer and the states («Решено», «Закрыть»). The traveller is «Гость». The messages come by Realtime; the
 * conversation is read as soon as it is open.
 */
export function ConversationView({
  conversation,
  onBack,
  onChange,
}: {
  conversation: HotelierConversation
  onBack: () => void
  onChange: (conversation: HotelierConversation) => void
}) {
  const { id, kind, status, hotelierUnread } = conversation
  const [messages, setMessages] = useState<HotelierMessage[]>([])
  const [requests, setRequests] = useState<HotelierRequest[]>([])
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'error'>('loading')
  const [text, setText] = useState('')
  // Эвал's questions are about the hotel's characteristics: their answers go to the common knowledge unless unticked.
  const [shareable, setShareable] = useState(kind === 'ai_request')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const shareId = useId()
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const client = getBrowserClient()
    if (!client) return
    let current = true
    const stop = followConversation(client, id, {
      message: (message) => setMessages((list) => addMessage(list, message)),
      conversation: onChange,
      request: (request) => setRequests((list) => [...list.filter((r) => r.id !== request.id), request]),
    })
    Promise.all([loadMessages(client, id), loadRequests(client, id)])
      .then(([list, asked]) => {
        if (!current) return
        setMessages((live) => live.reduce(addMessage, list))
        setRequests(asked)
        setLoaded('ready')
      })
      .catch(() => current && setLoaded('error'))
    return () => {
      current = false
      stop()
    }
    // `onChange` is the list's setter of this conversation: a new one is no reason to subscribe again.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Read as soon as seen, and again with each new message of the guest or Эвал.
  useEffect(() => {
    const client = getBrowserClient()
    if (!client || hotelierUnread === 0) return
    onChange({ ...conversation, hotelierUnread: 0 })
    void markRead(client, id).catch(() => undefined)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- read again only for another conversation or a new message
  }, [id, hotelierUnread])

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages.length])

  const pending = requests.find((r) => r.status === 'pending')

  async function post(path: string, body: object): Promise<Response | null> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/hotelier/conversations/${encodeURIComponent(id)}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) setError(ANSWER_ERRORS[response.status] ?? ANSWER_ERROR)
      return response.ok ? response : null
    } catch {
      setError(ANSWER_ERROR)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function answer(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    const response = await post('messages', { text: value, shareable, ...(pending && { requestId: pending.id }) })
    if (!response) return
    const message = (await response.json()) as HotelierMessage
    setMessages((list) => addMessage(list, message))
    setText('')
  }

  async function setStatus(next: ConversationStatus) {
    const response = await post('status', { status: next })
    if (response) onChange((await response.json()) as HotelierConversation)
  }

  const closed = status === 'closed'
  return (
    <section aria-label="Переписка" className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="К списку обращений" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg/tight font-bold">
            <Link href={`/hotels/${encodeURIComponent(conversation.hotelId)}`} className="hover:underline">
              {conversation.hotelName ?? conversation.hotelId}
            </Link>
          </h2>
          <p className="text-sm text-muted-foreground">
            {KIND_LABEL[kind]} · {STATUS_LABEL[status]}
          </p>
        </div>
        <div className="flex gap-2">
          {status !== 'resolved' && !closed && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus('resolved')}>
              Решено
            </Button>
          )}
          {closed || status === 'resolved' ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus('open')}>
              Открыть снова
            </Button>
          ) : null}
          {!closed && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus('closed')}>
              Закрыть
            </Button>
          )}
        </div>
      </header>

      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}

      <div
        ref={log}
        role="log"
        aria-label="История переписки"
        className="flex min-h-48 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain rounded-xl border p-3"
      >
        {loaded === 'loading' && <p className="text-muted-foreground">Загружаем переписку…</p>}
        {loaded === 'error' && <p role="alert">Переписка не загрузилась.</p>}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </div>

      <form onSubmit={answer} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Ответ гостю
        </label>
        <Textarea
          id={inputId}
          value={text}
          maxLength={MAX_HOTELIER_MESSAGE}
          rows={3}
          disabled={closed}
          placeholder={closed ? 'Обращение закрыто' : 'Ваш ответ…'}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id={shareId} checked={shareable} onCheckedChange={setShareable} />
            <label htmlFor={shareId} className="text-sm">
              Можно использовать в общих сведениях об отеле (без данных гостя)
            </label>
          </div>
          <Button type="submit" className="ml-auto" disabled={busy || closed || !text.trim()}>
            <SendHorizontal aria-hidden />
            Ответить
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
