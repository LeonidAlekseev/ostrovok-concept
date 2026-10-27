import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ChevronLeft, EllipsisVertical, Pencil, Share2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Chat } from '../../lib/assistantChats'
import { hotelHref, DEFAULT_GUESTS } from '../../lib/search'
import { DeleteDialog, RenameForm, ShareDialog, SharePopover } from './ChatActions'

interface Props {
  chat: Chat
  /** «2 гостя · 25–26 окт · Валенсия»; empty when the chat knows none of it. */
  trip: string
  signedIn: boolean
  onBack: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

/** The round grey buttons of the header. */
const circleButton = 'size-11 flex-none rounded-full bg-muted text-foreground hover:bg-secondary [&_svg]:size-5.5'

/**
 * The open chat's header: «назад» to the list on phones, the title and under it the line of the trip from the saved
 * parameters, the pencil (rename) and the menu «⋮» with «Поделиться», «Переименовать» and «Удалить» (after a
 * confirmation), in grey circles; from `sm` «Поделиться» has a circle of its own too.
 */
export function ChatHeader({ chat, trip, signedIn, onBack, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sharing, setSharing] = useState(false)
  // «Переименовать» of the menu: the focus stays in the title's field, not back on the menu's button.
  const renaming = useRef(false)
  return (
    <header className="flex flex-none items-center gap-2 sm:gap-3">
      <Button variant="ghost" size="icon-sm" className="-ml-1.5 lg:hidden" aria-label="Назад к чатам" onClick={onBack}>
        <ChevronLeft className="size-7" aria-hidden />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <RenameForm
            title={chat.title}
            onDone={(title) => {
              if (title !== null) onRename(title)
              renaming.current = false
              setEditing(false)
            }}
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="min-w-0 truncate text-[clamp(18px,5vw,22px)]/[1.25] font-bold tracking-[-0.01em]">
              {chat.brief.hotelId ? (
                <Link
                  href={hotelHref(
                    chat.brief.hotelId,
                    chat.brief.dates && { ...chat.brief.dates, guests: DEFAULT_GUESTS },
                  )}
                  className="text-primary hover:underline"
                >
                  {chat.title || 'Новый чат'}
                </Link>
              ) : (
                chat.title || 'Новый чат'
              )}
            </h2>
          </div>
        )}
        {trip && <p className="truncate text-[15px]/[1.35] text-muted-foreground">{trip}</p>}
      </div>
      <SharePopover chat={chat} signedIn={signedIn} className={`${circleButton} max-sm:hidden`} />
      <Button
        variant="ghost"
        size="icon"
        className={circleButton}
        aria-label="Переименовать чат"
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className={circleButton} />}
          aria-label="Действия с чатом"
        >
          <EllipsisVertical aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" finalFocus={() => !renaming.current}>
          <DropdownMenuItem onClick={() => setSharing(true)}>
            <Share2 aria-hidden />
            Поделиться
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              renaming.current = true
              setEditing(true)
            }}
          >
            <Pencil aria-hidden />
            Переименовать
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareDialog chat={chat} signedIn={signedIn} open={sharing} onOpenChange={setSharing} />
      <DeleteDialog chat={chat} open={confirm} onOpenChange={setConfirm} onDelete={onDelete} />
    </header>
  )
}

/**
 * The header of a chat that has no message yet: «назад» to the list on phones (when there are chats), Eval's round
 * avatar, «Новый чат» and «Ассистент Эвал»; no «Поделиться», no menu.
 */
export function NewChatHeader({ canGoBack, onBack }: { canGoBack: boolean; onBack: () => void }) {
  return (
    <header className="flex flex-none items-center gap-2 sm:gap-3">
      {canGoBack && (
        <Button variant="ghost" size="icon-sm" className="-ml-1 lg:hidden" aria-label="Назад к чатам" onClick={onBack}>
          <ChevronLeft className="size-6" aria-hidden />
        </Button>
      )}
      <Image
        src="/assistant/eval.webp"
        alt="Эвал"
        width={96}
        height={96}
        preload
        className="size-11 flex-none rounded-full bg-muted object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate text-[clamp(16px,4.2vw,19px)]/[1.3] font-bold tracking-[-0.01em]">Новый чат</h2>
        <p className="truncate text-sm/[1.35] text-muted-foreground">Ассистент Эвал</p>
      </div>
    </header>
  )
}
