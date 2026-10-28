'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/hooks/useStore'
import { addMessage, type HotelierConversation, type HotelierMessage } from '@/lib/hotelierChat'
import { followConversation, loadHotelChat, loadMessages, markRead } from '@/lib/hotelierChatRemote'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * The signed-in traveller's chat with the hotel's hotelier: their newest chat with the hotel, its messages, and
 * Realtime for the answers. Apart from the chat with Эвал: each keeps its own history. The writes go to
 * `POST /api/hotels/{hotelId}/hotelier/messages`, whose limits and checks are the server's.
 */

export type HotelierChatState = 'guest' | 'loading' | 'ready' | 'error'

export interface HotelierChat {
  state: HotelierChatState
  conversation: HotelierConversation | null
  messages: HotelierMessage[]
  sending: boolean
  /** The last send's failure, in Russian. */
  sendError: string | null
  send(text: string): Promise<boolean>
  /** The traveller sees the chat: the hotelier's answers are read. */
  read(): void
}

/** What the traveller is told of a refused message, by the route's status. */
export const SEND_ERRORS: Record<number, string> = {
  401: 'Войдите, чтобы написать отельеру',
  404: 'Этот отель не принимает сообщения',
  409: 'Чат закрыт: напишите снова — начнётся новый',
  429: 'Слишком много сообщений: подождите минуту',
}
export const SEND_ERROR = 'Не удалось отправить сообщение, попробуйте ещё раз'

export function useHotelierChat(hotelId: string): HotelierChat {
  const session = useSession()
  const signedIn = session !== null
  const [state, setState] = useState<HotelierChatState>(signedIn ? 'loading' : 'guest')
  const [conversation, setConversation] = useState<HotelierConversation | null>(null)
  const [messages, setMessages] = useState<HotelierMessage[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const conversationId = conversation?.id ?? null

  // The newest chat with the hotel, read again for another account.
  useEffect(() => {
    const client = getBrowserClient()
    let current = true
    if (!signedIn || !client) {
      // oxlint-disable-next-line react/set-state-in-effect -- a guest has no chat to read
      setState('guest')
      setConversation(null)
      setMessages([])
      return
    }
    setState('loading')
    loadHotelChat(client, hotelId)
      .then(async (found) => {
        const list = found ? await loadMessages(client, found.id) : []
        if (!current) return
        setConversation(found)
        setMessages(list)
        setState('ready')
      })
      .catch(() => current && setState('error'))
    return () => {
      current = false
    }
  }, [hotelId, signedIn, session?.email])

  // The answers and the changes of the chat as they come; the subscription goes with the chat.
  useEffect(() => {
    const client = getBrowserClient()
    if (!client || !conversationId) return
    return followConversation(client, conversationId, {
      message: (message) => setMessages((list) => addMessage(list, message)),
      conversation: (next) => setConversation((old) => (old?.id === next.id ? next : old)),
    })
  }, [conversationId])

  const sendingRef = useRef(false)
  const send = useCallback(
    async (text: string) => {
      if (sendingRef.current || !text.trim()) return false
      sendingRef.current = true
      setSending(true)
      setSendError(null)
      try {
        const response = await fetch(`/api/hotels/${encodeURIComponent(hotelId)}/hotelier/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!response.ok) {
          setSendError(SEND_ERRORS[response.status] ?? SEND_ERROR)
          return false
        }
        const body = (await response.json()) as { conversation: HotelierConversation; message: HotelierMessage }
        setConversation((old) => (old?.id === body.conversation.id ? old : body.conversation))
        setMessages((list) =>
          addMessage(
            list.filter((m) => m.conversationId === body.conversation.id),
            body.message,
          ),
        )
        return true
      } catch {
        setSendError(SEND_ERROR)
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [hotelId],
  )

  const unread = conversation?.userUnread ?? 0
  const read = useCallback(() => {
    const client = getBrowserClient()
    if (!client || !conversationId || unread === 0) return
    setConversation((old) => (old ? { ...old, userUnread: 0 } : old))
    void markRead(client, conversationId).catch(() => undefined)
  }, [conversationId, unread])

  return { state, conversation, messages, sending, sendError, send, read }
}
