import Image from 'next/image'
import { useId, useState } from 'react'
import {
  Building2,
  Heart,
  Landmark,
  LoaderCircle,
  Luggage,
  MessageCircle,
  Mountain,
  Palmtree,
  Plus,
  Search,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { chatKind, chatPreview, chatTime, groupChats, searchChats, type ChatKind } from '../../lib/assistantChatList'
import { isPending, type Chat } from '../../lib/assistantChats'

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
    <span className={`grid size-10 flex-none place-items-center rounded-xl ${tint} ${className}`} aria-hidden>
      <Icon className="size-5" />
    </span>
  )
}

interface Props {
  chats: readonly Chat[]
  activeId: string | null
  /** The chats are still loading. */
  ready: boolean
  onChoose: (chatId: string) => void
  onNew: () => void
  className?: string
}

/**
 * The left column on wider screens, the first screen on phones: the logo, «Новый чат», the search over the titles
 * and the messages, the chats by day (an icon by the trip, the title, the time, the start of the last message, a mark
 * of a new or a pending answer) and the card of the assistant.
 */
export function ChatList({ chats, activeId, ready, onChoose, onNew, className = '' }: Props) {
  const [query, setQuery] = useState('')
  const searchId = useId()
  // The groups and the times are of the day the page opened.
  const [now] = useState(() => new Date())
  const found = searchChats(chats, query)
  const groups = groupChats(found, now)
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
        className="h-12 w-full rounded-2xl bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))] text-base text-primary hover:bg-[color-mix(in_srgb,var(--primary)_16%,var(--decor-light))]"
        onClick={onNew}
      >
        <Plus className="size-5" aria-hidden />
        Новый чат
      </Button>
      <InputGroup className="h-11 rounded-2xl border-0 bg-(--decor-light) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_80%,transparent)]">
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

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-1">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
            <h3 className="px-2 text-sm/[normal] font-medium text-muted-foreground">{group.label}</h3>
            <ul className="flex flex-col gap-0.5">
              {group.chats.map((chat) => (
                <li key={chat.id}>
                  <ChatRow chat={chat} now={now} current={chat.id === activeId} onChoose={onChoose} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {ready && chats.length > 0 && found.length === 0 && (
          <p className="px-2 text-sm/[normal] text-muted-foreground">Ничего не нашлось</p>
        )}
        {ready && chats.length === 0 && (
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
  onChoose: (chatId: string) => void
}

function ChatRow({ chat, now, current, onChoose }: RowProps) {
  const pending = isPending(chat)
  const preview = chatPreview(chat)
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-(--decor-light) aria-[current=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--decor-light))]"
      aria-current={current}
      onClick={() => onChoose(chat.id)}
    >
      <ChatIcon chat={chat} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px]/[1.3] font-semibold group-aria-[current=true]:text-primary">
            {chat.title || 'Новый чат'}
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
  )
}
