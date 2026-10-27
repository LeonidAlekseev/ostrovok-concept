'use client'

import Image from 'next/image'
import { useCallback } from 'react'
import { tripsChatOf, type Chat } from '@/lib/assistantChats'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { EvalChat, EvalChatProvider } from '../EvalChat/EvalChat'

const TRIPS_QUESTIONS = [
  'Какие у меня поездки?',
  'Когда ближайшая поездка?',
  'Какие условия отмены?',
  'Хочу изменить даты',
]
const BOOKING_QUESTIONS = ['Какие условия отмены?', 'Сколько стоит бронь?', 'Во сколько заезд?', 'Хочу изменить даты']

/**
 * Эвал on «Мои поездки» and a booking's page: a floating button opens the side panel with the chat about the bookings
 * — the whole feed, the blocks of the tools with their sources and the proposals to confirm. Opened on a booking, the
 * chat is about it (`bookingId`). The bookings stay in this browser: each question sends them as they are, and a
 * change of the dates applies here only with «Подтвердить». `open` lets the page open the panel itself.
 */
export function TripsAssistant({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const previous = useCallback((chats: readonly Chat[]) => tripsChatOf(chats, bookingId), [bookingId])
  return (
    <EvalChatProvider scope={{ trips: true, ...(bookingId && { bookingId }) }} previous={previous}>
      <Sheet open={open} onOpenChange={onOpenChange && ((next) => onOpenChange(next))}>
        <SheetTrigger
          render={
            <Button
              shape="pill"
              size="lg"
              className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[max(16px,env(safe-area-inset-bottom))] z-40 h-14 gap-2 pr-5 pl-1.5 shadow-(--shadow-card)"
            />
          }
        >
          <span className="size-11 flex-none overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--decor-assistant-sky)_45%,var(--decor-light))]">
            <Image src="/assistant/eval.webp" alt="" width={88} height={88} className="size-full" />
          </span>
          Спросить Эвала
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-full gap-0 p-[clamp(12px,3vw,20px)] data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetTitle className="sr-only">Эвал — помощник по поездкам</SheetTitle>
          <EvalChat
            feed
            className="min-h-0 flex-1"
            subtitle={bookingId ? `Помощник по бронированию ${bookingId}` : 'Помощник по вашим поездкам'}
            greeting={
              bookingId
                ? 'Привет! Я Эвал. Расскажу о деталях этой брони, условиях отмены и помогу перенести даты.'
                : 'Привет! Я Эвал. Расскажу о ваших бронированиях, условиях отмены и помогу перенести даты.'
            }
            questions={bookingId ? BOOKING_QUESTIONS : TRIPS_QUESTIONS}
            inputLabel="Вопрос о поездках"
          />
        </SheetContent>
      </Sheet>
    </EvalChatProvider>
  )
}
