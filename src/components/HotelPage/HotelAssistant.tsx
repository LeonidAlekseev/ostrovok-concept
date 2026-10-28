'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { hotelChatOf, type Chat } from '@/lib/assistantChats'
import type { Hotel } from '@/lib/catalog'
import { EvalChat, EvalChatProvider } from '../EvalChat/EvalChat'
import { HotelierChat, HotelierChatProvider, HotelierUnread } from '../HotelierChat/HotelierChat'
import { useHotelStay } from './stayContext'

/** The ready-made questions of the card. */
const HOTEL_QUESTIONS = [
  'Какие номера есть?',
  'Что рядом с отелем?',
  'Есть ли парковка?',
  'Можно с питомцами?',
] as const

/**
 * The hotel's chats for the cards of the page — with Эвал and with the hotelier: the side column's and the booking
 * panel's of a phone show the same ones, so each is read and saved once. Inside `HotelStay`: the page's dates go with
 * the questions.
 */
export function HotelAssistantProvider({ hotel, children }: { hotel: Hotel; children: ReactNode }) {
  const { stay } = useHotelStay()
  const previous = useCallback((chats: readonly Chat[]) => hotelChatOf(chats, hotel.id), [hotel.id])
  return (
    <EvalChatProvider
      scope={{
        id: hotel.id,
        name: hotel.name,
        ...(stay && { dates: { checkIn: stay.checkIn, checkOut: stay.checkOut } }),
      }}
      previous={previous}
    >
      <HotelierChatProvider hotelId={hotel.id}>{children}</HotelierChatProvider>
    </EvalChatProvider>
  )
}

const TAB_CLASS =
  'flex-1 cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground-strong data-active:bg-card data-active:text-foreground data-active:shadow-sm'

/**
 * The card of the hotel's page with two tabs: «Эвал» — the greeting, the ready-made questions, a field and the latest
 * messages of the hotel's chat with Эвал — and «Отельер», the traveller's own chat with the hotel's hotelier. The chat
 * with Эвал is one of the traveller's chats (`brief.hotelId`): it is in their list, the page continues the newest one
 * of this hotel, and «Открыть в Эвале» opens it whole; it is created with the first question. Each tab keeps its own
 * history and its draft when the other one is open.
 */
export function HotelAssistant({ className }: { className?: string }) {
  const [tab, setTab] = useState<'eval' | 'hotelier'>('eval')
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value)} className={cn('flex flex-col gap-3', className)}>
      <TabsList className="flex gap-1 rounded-full bg-muted p-1" aria-label="Чат на странице отеля">
        <TabsTrigger value="eval" className={TAB_CLASS}>
          Эвал
        </TabsTrigger>
        <TabsTrigger value="hotelier" className={TAB_CLASS}>
          Отельер
          <HotelierUnread />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="eval" keepMounted className="data-hidden:hidden">
        <EvalChat
          subtitle="Помощник по этому отелю"
          greeting="Привет! Я Эвал. Помогу с выбором номера, расскажу про удобства и отвечу на вопросы об отеле."
          questions={HOTEL_QUESTIONS}
          inputLabel="Вопрос об отеле"
        />
      </TabsContent>
      <TabsContent value="hotelier" keepMounted className="data-hidden:hidden">
        <HotelierChat visible={tab === 'hotelier'} />
      </TabsContent>
    </Tabs>
  )
}
