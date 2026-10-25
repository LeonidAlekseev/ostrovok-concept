'use client'

import Link from 'next/link'
import { Eye, Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useDestinations } from '../Catalog/useDestinations'
import { useHotelSearch } from '@/hooks/useHotelSearch'
import { tripLine, tripParams } from '../../lib/assistantChatList'
import type { SharedChat as Share } from '../../lib/assistantShare'
import { Feed } from './ChatFeed'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * `/assistant/shared/<id>`: a snapshot of a chat with Eval, for anyone with the link. The messages and the hotel
 * cards as they were; no composer, no list of chats, no actions on the answers.
 */
export function SharedChat({ share }: { share: Share }) {
  const destinations = useDestinations()
  const { searchFor } = useHotelSearch()
  const trip = tripLine(
    tripParams(
      {
        id: share.id,
        title: share.title,
        brief: share.brief,
        question: null,
        unread: false,
        createdAt: share.createdAt,
        updatedAt: share.createdAt,
        messages: share.messages,
      },
      destinations,
    ),
  )
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col px-(--page-x) py-[clamp(12px,3vw,32px)]">
      <section
        aria-labelledby="shared-title"
        className={`bg-(--decor-light) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_70%,transparent)] mx-auto flex h-[calc(100dvh-var(--header-height)-clamp(24px,6vw,64px))] min-h-[420px] w-full max-w-3xl flex-col gap-3 rounded-[28px] p-[clamp(12px,3vw,24px)]`}
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 id="shared-title" className="truncate text-[clamp(18px,4.6vw,22px)]/[1.3] font-bold">
              {share.title || 'Чат с Эвалом'}
            </h1>
            <p className="flex items-center gap-1.5 text-sm/[1.35] text-muted-foreground">
              <Eye className="size-4 flex-none" aria-hidden />
              <span className="truncate">
                Только для чтения · {dayFormat.format(new Date(share.createdAt))}
                {trip && ` · ${trip}`}
              </span>
            </p>
          </div>
          <Link href="/assistant" className={buttonVariants({ size: 'sm', shape: 'pill' })}>
            <Sparkles className="size-4" aria-hidden />
            Спросить Эвал
          </Link>
        </header>
        <Feed chatId={share.id} messages={share.messages} onChoose={searchFor} />
      </section>
    </main>
  )
}
