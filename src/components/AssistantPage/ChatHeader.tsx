import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { Check, ChevronLeft, Copy, EllipsisVertical, LoaderCircle, Pencil, Share2, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Chat } from '../../lib/assistantChats'
import { hotelHref, DEFAULT_GUESTS } from '../../lib/search'
import { SHARE_ERROR, shareChat, shareHref } from '../../lib/assistantShare'
import { getBrowserClient } from '../../lib/supabase/client'
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
              {chat.title || 'Новый чат'}
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
        {(trip || chat.brief.hotelId) && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm/[1.35] text-muted-foreground">
            {chat.brief.hotelId && (
              <>
                <Link
                  href={hotelHref(
                    chat.brief.hotelId,
                    chat.brief.dates && { ...chat.brief.dates, guests: DEFAULT_GUESTS },
                  )}
                  className="flex-none font-medium text-primary hover:underline"
                >
                  Страница отеля
                </Link>
                {trip && <span aria-hidden>·</span>}
              </>
            )}
            {trip && <span className="truncate">{trip}</span>}
          </p>
        )}
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
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить чат?</DialogTitle>
            <DialogDescription>
              «{chat.title || 'Новый чат'}» и все его сообщения удалятся без возможности восстановить. Ссылки, которыми
              вы уже поделились, продолжат открываться.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirm(false)
                onDelete()
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}

/** The title in a field: Enter or leaving it saves, Escape cancels (`null`). */
function RenameForm({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(title)
  const save = (event?: FormEvent) => {
    event?.preventDefault()
    onDone(value.trim() ? value : null)
  }
  return (
    <form onSubmit={save} className="flex items-center gap-1">
      <Input
        aria-label="Название чата"
        className="h-9 text-base font-semibold"
        value={value}
        maxLength={60}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the title the pencil was pressed for
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => save()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(null)
        }}
      />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Сохранить название">
        <Check className="size-4" aria-hidden />
      </Button>
    </form>
  )
}

type ShareState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; url: string; copied: boolean }
  | { kind: 'error'; message: string }

/**
 * «Поделиться»: a signed-in user gets the link of a read-only snapshot, copied at once where the browser lets it;
 * a guest is offered to sign in. The snapshot is the chat as it is now; a new press makes a new one.
 */
function SharePopover({ chat, signedIn }: { chat: Chat; signedIn: boolean }) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' })

  const share = async () => {
    const client = getBrowserClient()
    if (!client) return setState({ kind: 'error', message: SHARE_ERROR })
    setState({ kind: 'saving' })
    try {
      const url = new URL(shareHref(await shareChat(client, chat)), window.location.origin).toString()
      const copied = await navigator.clipboard?.writeText(url).then(
        () => true,
        () => false,
      )
      setState({ kind: 'done', url, copied: copied ?? false })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : SHARE_ERROR })
    }
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && signedIn) void share()
        if (!open) setState({ kind: 'idle' })
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            shape="pill"
            className="h-9 bg-(--decor-light) text-foreground max-xl:w-9 max-xl:p-0"
          />
        }
      >
        <Share2 className="size-4" aria-hidden />
        <span className="max-xl:sr-only">Поделиться</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-24px))] gap-3 p-4 shadow-(--shadow-popover)">
        <p className="font-semibold">Поделиться чатом</p>
        {!signedIn ? (
          <>
            <p className="text-sm/[1.45] text-muted-foreground">
              Войдите, чтобы поделиться чатом: по ссылке его можно будет только читать.
            </p>
            <Link href="/login" className={buttonVariants({ size: 'sm', shape: 'pill', className: 'self-start' })}>
              Войти
            </Link>
          </>
        ) : state.kind === 'done' ? (
          <>
            <p className="text-sm/[1.45] text-muted-foreground" aria-live="polite">
              {state.copied ? 'Ссылка скопирована.' : 'Ссылка готова.'} По ней чат можно только читать.
            </p>
            <div className="flex items-center gap-2">
              <Input aria-label="Ссылка на чат" readOnly value={state.url} onFocus={(e) => e.target.select()} />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Скопировать ссылку"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(state.url)
                    .then(() => setState({ ...state, copied: true }))
                    .catch(() => {})
                }
              >
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>
          </>
        ) : state.kind === 'error' ? (
          <p className="text-sm/[1.45] text-destructive" role="alert">
            {state.message}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm/[1.45] text-muted-foreground">
            <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />
            Готовлю ссылку…
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
