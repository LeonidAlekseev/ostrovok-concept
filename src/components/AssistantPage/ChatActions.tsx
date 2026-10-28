import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { Check, Copy, LoaderCircle, Share2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Chat } from '../../lib/assistantChats'
import { SHARE_ERROR, UNSHARE_ERROR, deleteShare, shareChat, shareHref } from '../../lib/assistantShare'
import type { Database } from '../../lib/db/database.types'
import { getBrowserClient } from '../../lib/supabase/client'

// The actions of a chat the header and the rows of the list share.

/** The title in a field: Enter or leaving it saves, Escape cancels (`null`). */
export function RenameForm({
  title,
  className = '',
  onDone,
}: {
  title: string
  className?: string
  onDone: (title: string | null) => void
}) {
  const [value, setValue] = useState(title)
  const save = (event?: FormEvent) => {
    event?.preventDefault()
    onDone(value.trim() ? value : null)
  }
  return (
    <form onSubmit={save} className={`flex items-center gap-1 ${className}`}>
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

/** The chat to share: as it is, or read when «Поделиться» is pressed (a chat with a hotelier is not in memory). */
export type ChatSource = Chat | ((client: SupabaseClient<Database>) => Promise<Chat>)

type ShareState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | {
      kind: 'done'
      id: string
      url: string
      copied: boolean
      /** «Удалить ссылку» pressed, waiting for the confirmation. */
      confirming: boolean
      removing: boolean
      /** The link stays; the deletion failed. */
      error?: string
    }
  | { kind: 'deleted' }
  | { kind: 'error'; message: string }

/**
 * «Поделиться»: a signed-in user gets the link of a read-only snapshot, copied at once where the browser lets it;
 * a guest is offered to sign in. The snapshot is the chat as it is now; a new press makes a new one. The link can
 * be deleted: its snapshot and photos go, and the link opens nothing.
 */
function useShare(chat: ChatSource, signedIn: boolean) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' })

  const share = async () => {
    const client = getBrowserClient()
    if (!client) return setState({ kind: 'error', message: SHARE_ERROR })
    setState({ kind: 'saving' })
    try {
      const id = await shareChat(client, typeof chat === 'function' ? await chat(client) : chat)
      const url = new URL(shareHref(id), window.location.origin).toString()
      const copied = await navigator.clipboard?.writeText(url).then(
        () => true,
        () => false,
      )
      setState({ kind: 'done', id, url, copied: copied ?? false, confirming: false, removing: false })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : SHARE_ERROR })
    }
  }

  /** The link is deleted after the confirmation; a failure keeps the link on the screen with the message. */
  const remove = async (id: string) => {
    const client = getBrowserClient()
    setState((s) => (s.kind === 'done' ? { ...s, removing: true, error: undefined } : s))
    try {
      if (!client) throw new Error(UNSHARE_ERROR)
      await deleteShare(client, id)
      setState({ kind: 'deleted' })
    } catch (error) {
      const message = error instanceof Error ? error.message : UNSHARE_ERROR
      setState((s) => (s.kind === 'done' ? { ...s, removing: false, confirming: false, error: message } : s))
    }
  }

  /** The share was opened (`true`) or closed. */
  const toggle = (open: boolean) => {
    if (open && signedIn) void share()
    if (!open) setState({ kind: 'idle' })
  }
  return { state, setState, toggle, remove }
}

function ShareBody({ share, signedIn }: { share: ReturnType<typeof useShare>; signedIn: boolean }) {
  const { state, setState, remove } = share
  return (
    <>
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
          {state.error && (
            <p className="text-sm/[1.45] text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state.confirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm/[1.45] text-muted-foreground">
                По ссылке чат перестанет открываться. Сам чат останется.
              </p>
              <div className="flex gap-2 self-start">
                <Button
                  variant="outline"
                  size="sm"
                  shape="pill"
                  disabled={state.removing}
                  onClick={() => setState({ ...state, confirming: false })}
                >
                  Отмена
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  shape="pill"
                  disabled={state.removing}
                  onClick={() => void remove(state.id)}
                >
                  {state.removing && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />}
                  Удалить ссылку
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              shape="pill"
              className="self-start text-destructive"
              onClick={() => setState({ ...state, confirming: true, error: undefined })}
            >
              Удалить ссылку
            </Button>
          )}
        </>
      ) : state.kind === 'deleted' ? (
        <>
          <p className="font-semibold" aria-live="polite">
            Ссылка удалена
          </p>
          <p className="text-sm/[1.45] text-muted-foreground">По ней чат больше не открывается.</p>
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
    </>
  )
}

/** «Поделиться» of the header: a round button with the popover of the link. */
export function SharePopover({
  chat,
  signedIn,
  className,
}: {
  chat: ChatSource
  signedIn: boolean
  className?: string
}) {
  const share = useShare(chat, signedIn)
  return (
    <Popover onOpenChange={share.toggle}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className={className} />} aria-label="Поделиться">
        <Share2 aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-24px))] gap-3 p-4 shadow-(--shadow-popover)">
        <ShareBody share={share} signedIn={signedIn} />
      </PopoverContent>
    </Popover>
  )
}

/** «Поделиться» from a row's menu: the same, in a dialog (the menu's item has no place to anchor a popover to). */
export function ShareDialog({
  chat,
  signedIn,
  open,
  onOpenChange,
}: {
  chat: ChatSource
  signedIn: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const share = useShare(chat, signedIn)
  // The parent opens the dialog (the row's menu item), so the link is made when it opens, not on a press here.
  const onOpen = useEffectEvent(() => share.toggle(true))
  useEffect(() => {
    if (open) onOpen()
  }, [open])
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        share.toggle(next)
        onOpenChange(next)
      }}
    >
      <DialogContent className="gap-3">
        <ShareBody share={share} signedIn={signedIn} />
      </DialogContent>
    </Dialog>
  )
}

/** «Удалить» asks first. */
export function DeleteDialog({
  chat,
  open,
  onOpenChange,
  onDelete,
  description,
}: {
  chat: Pick<Chat, 'title'>
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  /** What the deletion does, when it is not the deletion of Эвал's chat. */
  description?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить чат?</DialogTitle>
          <DialogDescription>
            {description ??
              `«${chat.title || 'Новый чат'}» и все его сообщения удалятся без возможности восстановить. Ссылки, которыми вы уже поделились, продолжат открываться.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              onDelete()
            }}
          >
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
