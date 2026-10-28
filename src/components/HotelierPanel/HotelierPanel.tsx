'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useHydrated } from '@/hooks/useHydrated'
import { useSession } from '@/hooks/useStore'
import { chatTime } from '@/lib/assistantChatList'
import {
  CONVERSATION_KINDS,
  CONVERSATION_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
  matchesFilter,
  senderLabel,
  type ConversationKind,
  type ConversationStatus,
  type HotelierConversation,
  type InboxFilter,
} from '@/lib/hotelierChat'
import { ConversationView } from './ConversationView'
import { useInbox } from './useInbox'

export const pageClass =
  'mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-4 px-(--page-x) py-[clamp(20px,4vw,32px)]'

function Gate({ title, text, href }: { title: string; text: string; href?: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-title font-bold tracking-[-0.02em]">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      {href && (
        <Link className={buttonVariants()} href={href}>
          Войти
        </Link>
      )}
    </div>
  )
}

function Row({
  conversation,
  active,
  now,
  onOpen,
}: {
  conversation: HotelierConversation
  active: boolean
  now: Date
  onOpen: () => void
}) {
  const { hotelName, hotelId, kind, status, lastMessageAt, lastMessageText, lastSender, hotelierUnread } = conversation
  return (
    <li>
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onOpen}
        className={cn(
          'flex w-full cursor-pointer flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-muted',
          active && 'bg-muted',
        )}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{hotelName ?? hotelId}</span>
          <time dateTime={lastMessageAt} className="flex-none text-xs text-muted-foreground">
            {chatTime(lastMessageAt, now)}
          </time>
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground-strong">
          {lastSender && `${senderLabel(lastSender, 'hotelier')}: `}
          {lastMessageText || '—'}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge>{KIND_LABEL[kind]}</Badge>
          <Badge
            variant={status === 'resolved' ? 'success' : status === 'waiting_hotelier' ? 'destructive' : 'secondary'}
          >
            {STATUS_LABEL[status]}
          </Badge>
          {hotelierUnread > 0 && (
            <Badge className="ml-auto bg-primary text-primary-foreground">
              {hotelierUnread}
              <span className="sr-only"> непрочитанных</span>
            </Badge>
          )}
        </span>
      </button>
    </li>
  )
}

/**
 * The hotelier's panel (/hotelier): the conversations of their hotels with the filters by state, kind and hotel, and
 * the open one beside it. Only a hotelier's account sees it: the database decides (`is_hotelier`), the page only asks.
 * On a phone the list and the conversation take turns.
 */
export function HotelierPanel() {
  const hydrated = useHydrated()
  const session = useSession()
  const { state, conversations, put } = useInbox(hydrated && session !== null)
  const [filter, setFilter] = useState<InboxFilter>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const hotels = useMemo(() => {
    const names = new Map<string, string>()
    for (const c of conversations) names.set(c.hotelId, c.hotelName ?? c.hotelId)
    return [...names].sort((a, b) => a[1].localeCompare(b[1], 'ru'))
  }, [conversations])
  const shown = conversations.filter((c) => matchesFilter(c, filter))
  const open = conversations.find((c) => c.id === openId) ?? null

  if (!hydrated) return <p className="text-muted-foreground">Загружаем панель…</p>
  if (!session)
    return (
      <Gate
        title="Панель отельера"
        text="Войдите в аккаунт отельера, например «Демо отельер»."
        href="/login?next=%2Fhotelier"
      />
    )
  if (state === 'forbidden')
    return <Gate title="Панель отельера" text="Эта панель — для отельеров: у вашего аккаунта нет доступа к отелям." />
  if (state === 'error') return <Gate title="Панель отельера" text="Панель сейчас недоступна, попробуйте позже." />

  return (
    <>
      <h1 className={cn('text-title font-bold tracking-[-0.02em]', open && 'max-lg:sr-only')}>Обращения</h1>
      <div className="grid min-h-[70svh] gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className={cn('flex min-w-0 flex-col gap-3', open && 'max-lg:hidden')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтры">
            <NativeSelect
              aria-label="Статус"
              value={filter.status ?? ''}
              onChange={(e) => setFilter({ ...filter, status: (e.target.value || undefined) as ConversationStatus })}
            >
              <NativeSelectOption value="">Все статусы</NativeSelectOption>
              {CONVERSATION_STATUSES.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {STATUS_LABEL[status]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Инициатор"
              value={filter.kind ?? ''}
              onChange={(e) => setFilter({ ...filter, kind: (e.target.value || undefined) as ConversationKind })}
            >
              <NativeSelectOption value="">Все инициаторы</NativeSelectOption>
              {CONVERSATION_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Отель"
              className="max-w-full"
              value={filter.hotelId ?? ''}
              onChange={(e) => setFilter({ ...filter, hotelId: e.target.value || undefined })}
            >
              <NativeSelectOption value="">Все отели</NativeSelectOption>
              {hotels.map(([id, name]) => (
                <NativeSelectOption key={id} value={id}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {state === 'loading' ? (
            <p className="text-muted-foreground">Загружаем обращения…</p>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground">
              {conversations.length === 0 ? 'Обращений пока нет.' : 'Нет обращений под эти фильтры.'}
            </p>
          ) : (
            <ul aria-label="Обращения" className="flex flex-col gap-1">
              {shown.map((conversation) => (
                <Row
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === openId}
                  now={now}
                  onOpen={() => setOpenId(conversation.id)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className={cn('flex min-w-0 flex-col', !open && 'max-lg:hidden')}>
          {open ? (
            <ConversationView key={open.id} conversation={open} onBack={() => setOpenId(null)} onChange={put} />
          ) : (
            <p className="m-auto text-muted-foreground">Выберите обращение слева.</p>
          )}
        </div>
      </div>
    </>
  )
}
