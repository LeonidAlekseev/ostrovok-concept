'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/hooks/useStore'
import type { HotelierConversation } from '@/lib/hotelierChat'
import { deleteChatShares } from '@/lib/assistantShare'
import { followInbox, hideMyChat, loadMyChats } from '@/lib/hotelierChatRemote'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * The signed-in traveller's chats with the hotels' hoteliers, for «Мои чаты» beside Эвал's: read once, and again
 * whenever `openId` changes (a chat opened or left has read its answers or got a message) and whenever one of the
 * traveller's conversations changes (an answer of the hotelier, a new chat). A guest has none.
 */
export function useHotelierChats(openId: string | null): {
  chats: HotelierConversation[]
  ready: boolean
  /** «Удалить»: hides the chat from the list (the hotelier keeps it) and deletes the links the traveller made of it. */
  remove: (conversationId: string) => Promise<void>
} {
  const session = useSession()
  const signedIn = session !== null
  const [chats, setChats] = useState<HotelierConversation[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const client = getBrowserClient()
    let current = true
    if (!signedIn || !client) {
      // oxlint-disable-next-line react/set-state-in-effect -- a guest has no chats to read
      setChats([])
      setReady(true)
      return
    }
    const read = () =>
      loadMyChats(client)
        .then((list) => current && setChats(list))
        .catch(() => current && setChats([]))
        .finally(() => current && setReady(true))
    read()
    // The database sends the traveller their own conversations only (RLS); the list is read again, for it is the
    // database's to say which of them are «Мои чаты» (not the hotelier's requests, not the hidden ones).
    const stop = followInbox(client, () => void read())
    return () => {
      current = false
      stop()
    }
  }, [signedIn, session?.email, openId])

  const remove = useCallback(async (conversationId: string) => {
    const client = getBrowserClient()
    if (!client) return
    await hideMyChat(client, conversationId)
    setChats((list) => list.filter((c) => c.id !== conversationId))
    // The chat is gone from the list either way: a link that stays is only told.
    await deleteChatShares(client, conversationId).catch((error: unknown) => {
      console.warn(
        `hotelier chats: shares not deleted (${error instanceof Error ? error.message.slice(0, 200) : 'error'})`,
      )
    })
  }, [])

  return { chats, ready, remove }
}
