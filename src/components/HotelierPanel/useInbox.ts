'use client'

import { useEffect, useState } from 'react'
import { putConversation, type HotelierConversation } from '@/lib/hotelierChat'
import { followInbox, isHotelier, loadInbox } from '@/lib/hotelierChatRemote'
import { getBrowserClient } from '@/lib/supabase/client'

export type InboxState = 'loading' | 'forbidden' | 'ready' | 'error'

/**
 * The hotelier's conversations: those of their hotels (the demo hotelier's — of all), newest first, and every one
 * that starts or changes later by Realtime. `forbidden` for a user who is not a hotelier: the database says so.
 */
export function useInbox(signedIn: boolean) {
  const [state, setState] = useState<InboxState>('loading')
  const [conversations, setConversations] = useState<HotelierConversation[]>([])

  useEffect(() => {
    const client = getBrowserClient()
    if (!signedIn || !client) return
    let current = true
    let stop: (() => void) | undefined
    // oxlint-disable-next-line react/set-state-in-effect -- the list is read again for another account
    setState('loading')
    isHotelier(client)
      .then(async (hotelier) => {
        if (!current) return
        if (!hotelier) return setState('forbidden')
        // Subscribed first: a conversation that changes while the list is read is not lost.
        stop = followInbox(client, (conversation) => setConversations((list) => putConversation(list, conversation)))
        const list = await loadInbox(client)
        if (!current) return
        setConversations((live) => [...list, ...live].reduce(putConversation, []))
        setState('ready')
      })
      .catch(() => current && setState('error'))
    return () => {
      current = false
      stop?.()
    }
  }, [signedIn])

  /** The conversation as a write of the panel left it, before its Realtime event. */
  const put = (conversation: HotelierConversation) => setConversations((list) => putConversation(list, conversation))

  return { state, conversations, put }
}
