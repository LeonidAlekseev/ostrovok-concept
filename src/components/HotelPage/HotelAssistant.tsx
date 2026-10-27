'use client'

import { useCallback, type ReactNode } from 'react'
import { hotelChatOf, type Chat } from '@/lib/assistantChats'
import type { Hotel } from '@/lib/catalog'
import { EvalChat, EvalChatProvider } from '../EvalChat/EvalChat'
import { useHotelStay } from './stayContext'

/** The ready-made questions of the card. */
const HOTEL_QUESTIONS = [
  'Какие номера есть?',
  'Что рядом с отелем?',
  'Есть ли парковка?',
  'Можно с питомцами?',
] as const

/**
 * The hotel's chat for the cards of the page: the side column's and the booking panel's of a phone show one chat, so
 * the chats are read and saved once. Inside `HotelStay`: the page's dates go with the questions.
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
      {children}
    </EvalChatProvider>
  )
}

/**
 * «Эвал» on the hotel's page: the greeting, the ready-made questions, a field and the latest messages of the hotel's
 * chat. The chat is one of the traveller's chats with Эвал (`brief.hotelId`): it is in their list, the page continues
 * the newest one of this hotel, and «Открыть в Эвале» opens it whole. It is created with the first question.
 */
export function HotelAssistant({ className }: { className?: string }) {
  return (
    <EvalChat
      className={className}
      subtitle="Помощник по этому отелю"
      greeting="Привет! Я Эвал. Помогу с выбором номера, расскажу про удобства и отвечу на вопросы об отеле."
      questions={HOTEL_QUESTIONS}
      inputLabel="Вопрос об отеле"
    />
  )
}
