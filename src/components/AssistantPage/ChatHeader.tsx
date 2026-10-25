import Link from 'next/link'
import { useRef, useState } from 'react'
import { ChevronLeft, EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Chat } from '../../lib/assistantChats'
import { hotelHref, DEFAULT_GUESTS } from '../../lib/search'
import { DeleteDialog, RenameForm, SharePopover } from './ChatActions'
import { ChatIcon } from './ChatList'

interface Props {
  chat: Chat
  /** «2 гостя · 25–26 окт · Валенсия»; empty when the chat knows none of it. */
  trip: string
  signedIn: boolean
  onBack: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

/**
 * The open chat's header: «назад» to the list on phones, the title with its pencil, the line of the trip, «Поделиться»
 * and the menu with «Переименовать» and «Удалить» (after a confirmation).
 */
export function ChatHeader({ chat, trip, signedIn, onBack, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  // «Переименовать» of the menu: the focus stays in the title's field, not back on the menu's button.
  const renaming = useRef(false)
  return (
    <header className="flex flex-none items-center gap-2 sm:gap-3">
      <Button variant="ghost" size="icon-sm" className="-ml-1 lg:hidden" aria-label="Назад к чатам" onClick={onBack}>
        <ChevronLeft className="size-6" aria-hidden />
      </Button>
      <ChatIcon chat={chat} className="max-sm:hidden" />
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
            <h2 className="min-w-0 truncate text-[clamp(16px,4.2vw,19px)]/[1.3] font-bold tracking-[-0.01em]">
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
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 flex-none text-muted-foreground"
              aria-label="Переименовать чат"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        {trip && <p className="truncate text-sm/[1.35] text-muted-foreground">{trip}</p>}
      </div>
      <SharePopover chat={chat} signedIn={signedIn} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon-sm" className="bg-(--decor-light) text-foreground" />}
          aria-label="Действия с чатом"
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
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDialog chat={chat} open={confirm} onOpenChange={setConfirm} onDelete={onDelete} />
    </header>
  )
}
