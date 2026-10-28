import Image from 'next/image'
import { useId, useRef, useState } from 'react'
import {
  BellRing,
  Building2,
  Heart,
  Landmark,
  LoaderCircle,
  Luggage,
  MessageCircle,
  Mountain,
  Palmtree,
  EllipsisVertical,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { chatKind, chatPreview, chatTime, groupChats, searchChats, type ChatKind } from '../../lib/assistantChatList'
import { DeleteDialog, RenameForm, ShareDialog } from './ChatActions'
import { isPending, type Chat } from '../../lib/assistantChats'
import type { HotelierConversation } from '../../lib/hotelierChat'

/** The icon of a chat by the kind of trip, on its tint. */
const KIND_ICON: Record<ChatKind, { icon: LucideIcon; tint: string }> = {
  sea: { icon: Waves, tint: 'bg-[color-mix(in_srgb,var(--decor-assistant-sky)_45%,var(--decor-light))] text-primary' },
  mountains: {
    icon: Mountain,
    tint: 'bg-[color-mix(in_srgb,var(--decor-mint)_55%,var(--decor-light))] text-success-foreground',
  },
  city: {
    icon: Landmark,
    tint: 'bg-[color-mix(in_srgb,var(--decor-violet)_14%,var(--decor-light))] text-(--decor-violet)',
  },
  romantic: { icon: Heart, tint: 'bg-[color-mix(in_srgb,var(--destructive)_10%,var(--decor-light))] text-destructive' },
  weekend: { icon: Luggage, tint: 'bg-[color-mix(in_srgb,var(--decor-gold)_20%,var(--decor-light))] text-foreground' },
  exotic: {
    icon: Palmtree,
    tint: 'bg-[color-mix(in_srgb,var(--decor-mint)_55%,var(--decor-light))] text-success-foreground',
  },
  metropolis: {
    icon: Building2,
    tint: 'bg-[color-mix(in_srgb,var(--decor-indigo)_14%,var(--decor-light))] text-(--decor-indigo)',
  },
  chat: { icon: MessageCircle, tint: 'bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))] text-primary' },
}

export function ChatIcon({ chat, className = '' }: { chat: Chat; className?: string }) {
  const { icon: Icon, tint } = KIND_ICON[chatKind(chat.brief)]
  return (
    <span className={`grid size-10 flex-none place-items-center rounded-full ${tint} ${className}`} aria-hidden>
      <Icon className="size-5" />
    </span>
  )
}

interface Props {
  chats: readonly Chat[]
  activeId: string | null
  /** The chats are still loading. */
  ready: boolean
  signedIn: boolean
  onChoose: (chatId: string) => void
  onNew: () => void
  onRename: (chatId: string, title: string) => void
  onDelete: (chatId: string) => void
  /** The traveller's chats with the hotels' hoteliers, listed under Эвал's. */
  hotelier: readonly HotelierConversation[]
  /** The hotel whose chat is open. */
  hotelierActive: string | null
  onChooseHotelier: (hotelId: string) => void
  className?: string
}

/**
 * The left column on wider screens, the first screen on phones: the logo, «Новый чат», the search over the titles
 * and the messages, the chats by day (an icon by the trip, the title, the time, the start of the last message, a mark
 * of a new or a pending answer, the menu of «Переименовать», «Поделиться» and «Удалить») and the card of the assistant.
 */
export function ChatList({
  chats,
  activeId,
  ready,
  signedIn,
  onChoose,
  onNew,
  onRename,
  onDelete,
  hotelier,
  hotelierActive,
  onChooseHotelier,
  className = '',
}: Props) {
  const [query, setQuery] = useState('')
  const searchId = useId()
  // The groups and the times are of the day the page opened.
  const [now] = useState(() => new Date())
  const found = searchChats(chats, query)
  const groups = groupChats(found, now)
  const needle = query.trim().toLowerCase()
  const hotelierFound = needle
    ? hotelier.filter((c) => `${c.hotelName ?? ''} ${c.lastMessageText}`.toLowerCase().includes(needle))
    : hotelier
  return (
    <nav aria-label="Чаты" className={`flex min-h-0 flex-col gap-3 ${className}`}>
      {/* Phones have the site's header with the logo above the list. */}
      <a
        href="/"
        className="rounded-sm px-1 pt-1 text-[28px] leading-none font-extrabold tracking-[-0.035em] whitespace-nowrap text-primary no-underline max-lg:hidden"
      >
        О!бъективно
      </a>
      <Button
        variant="secondary"
        size="lg"
        className="h-12 w-full rounded-2xl bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))] text-base text-primary hover:bg-[color-mix(in_srgb,var(--primary)_16%,var(--decor-light))] max-lg:fixed max-lg:right-[max(16px,env(safe-area-inset-right))] max-lg:bottom-[max(16px,env(safe-area-inset-bottom))] max-lg:z-20 max-lg:h-14 max-lg:w-auto max-lg:rounded-full max-lg:bg-primary max-lg:px-5 max-lg:text-primary-foreground max-lg:shadow-(--shadow-popover) max-lg:hover:bg-primary/90"
        onClick={onNew}
      >
        <Plus className="size-5" aria-hidden />
        Новый чат
      </Button>
      <InputGroup className="h-11 rounded-2xl border-0 bg-muted shadow-none">
        <InputGroupAddon>
          <Search className="size-4.5" aria-hidden />
        </InputGroupAddon>
        <label htmlFor={searchId} className="sr-only">
          Поиск чатов
        </label>
        <InputGroupInput
          id={searchId}
          type="search"
          placeholder="Поиск чатов…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-1 max-lg:pb-24">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
            <h3 className="px-2 text-sm/[normal] font-medium text-muted-foreground">{group.label}</h3>
            <ul className="flex flex-col divide-y divide-border/70">
              {group.chats.map((chat) => (
                <li key={chat.id}>
                  <ChatRow
                    chat={chat}
                    now={now}
                    current={chat.id === activeId}
                    signedIn={signedIn}
                    onChoose={onChoose}
                    onRename={(title) => onRename(chat.id, title)}
                    onDelete={() => onDelete(chat.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {hotelierFound.length > 0 && (
          <section aria-label="С отельерами" className="flex flex-col gap-1">
            <h3 className="px-2 text-sm/[normal] font-medium text-muted-foreground">С отельерами</h3>
            <ul className="flex flex-col divide-y divide-border/70">
              {hotelierFound.map((chat) => (
                <li key={chat.id}>
                  <HotelierRow
                    chat={chat}
                    now={now}
                    current={chat.hotelId === hotelierActive}
                    onChoose={onChooseHotelier}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {ready && chats.length > 0 && found.length === 0 && hotelierFound.length === 0 && (
          <p className="px-2 text-sm/[normal] text-muted-foreground">Ничего не нашлось</p>
        )}
        {ready && chats.length === 0 && hotelier.length === 0 && (
          <p className="px-2 text-sm/[normal] text-muted-foreground">
            Здесь будут ваши чаты. Начните новый — опишите поездку своими словами.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-(--decor-light) p-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_60%,transparent)] max-lg:hidden">
        <Image src="/assistant/eval.webp" alt="" width={96} height={96} className="size-12 flex-none" />
        <p className="min-w-0 text-sm/[1.35] text-muted-foreground">
          <strong className="block text-foreground">AI-помощник Эвал</strong>
          Подбирает отели по вашему описанию: даты, бюджет, тишина, этажность и вид.
        </p>
      </div>
    </nav>
  )
}

interface RowProps {
  chat: Chat
  now: Date
  current: boolean
  signedIn: boolean
  onChoose: (chatId: string) => void
  onRename: (title: string) => void
  onDelete: () => void
}

function ChatRow({ chat, now, current, signedIn, onChoose, onRename, onDelete }: RowProps) {
  const pending = isPending(chat)
  const preview = chatPreview(chat)
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  // «Переименовать» of the menu: the focus stays in the field, not back on the menu's button.
  const renaming = useRef(false)
  const title = chat.title || 'Новый чат'
  if (editing) {
    return (
      <div className="flex items-center gap-3 px-2 py-3">
        <ChatIcon chat={chat} className="size-12" />
        <RenameForm
          title={chat.title}
          className="min-w-0 flex-1"
          onDone={(next) => {
            if (next !== null) onRename(next)
            renaming.current = false
            setEditing(false)
          }}
        />
      </div>
    )
  }
  return (
    <div
      className="group flex items-center gap-1 rounded-2xl pr-1 transition-colors hover:bg-(--decor-light) aria-[current=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))]"
      aria-current={current}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-3 text-left"
        aria-current={current}
        onClick={() => onChoose(chat.id)}
      >
        <ChatIcon chat={chat} className="size-12" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-base/[1.3] font-bold group-aria-[current=true]:text-primary">
              {title}
            </span>
            <time
              dateTime={chat.updatedAt}
              className="flex-none text-xs/[normal] text-muted-foreground group-aria-[current=true]:text-primary"
            >
              {chatTime(chat.updatedAt, now)}
            </time>
          </span>
          <span className="flex items-center gap-1.5 text-sm/[1.3] text-muted-foreground">
            {pending ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden />
                ждёт ответа
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate">{preview}</span>
            )}
            {chat.unread && <Badge className="h-4 flex-none px-1.5 text-[11px]">новое</Badge>}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" className="flex-none text-muted-foreground" />}
          aria-label={`Действия с чатом «${title}»`}
        >
          <EllipsisVertical className="size-5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" finalFocus={() => !renaming.current}>
          <DropdownMenuItem
            onClick={() => {
              renaming.current = true
              setEditing(true)
            }}
          >
            <Pencil aria-hidden />
            Переименовать
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSharing(true)}>
            <Share2 aria-hidden />
            Поделиться
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareDialog chat={chat} signedIn={signedIn} open={sharing} onOpenChange={setSharing} />
      <DeleteDialog chat={chat} open={confirm} onOpenChange={setConfirm} onDelete={onDelete} />
    </div>
  )
}

interface HotelierRowProps {
  chat: HotelierConversation
  now: Date
  current: boolean
  onChoose: (hotelId: string) => void
}

/** A chat with a hotelier: the hotel's name, the time and the start of the last message. */
function HotelierRow({ chat, now, current, onChoose }: HotelierRowProps) {
  const title = chat.hotelName ?? 'Отель'
  return (
    <button
      type="button"
      className="group flex w-full min-w-0 items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-(--decor-light) aria-[current=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))]"
      aria-current={current}
      onClick={() => onChoose(chat.hotelId)}
    >
      <span
        className="grid size-12 flex-none place-items-center rounded-full bg-muted text-muted-foreground-strong"
        aria-hidden
      >
        <BellRing className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-base/[1.3] font-bold group-aria-[current=true]:text-primary">
            {title}
          </span>
          <time
            dateTime={chat.lastMessageAt}
            className="flex-none text-xs/[normal] text-muted-foreground group-aria-[current=true]:text-primary"
          >
            {chatTime(chat.lastMessageAt, now)}
          </time>
        </span>
        <span className="flex items-center gap-1.5 text-sm/[1.3] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{chat.lastMessageText || 'Отельер'}</span>
          {chat.userUnread > 0 && <Badge className="h-4 flex-none px-1.5 text-[11px]">новое</Badge>}
        </span>
      </span>
    </button>
  )
}
