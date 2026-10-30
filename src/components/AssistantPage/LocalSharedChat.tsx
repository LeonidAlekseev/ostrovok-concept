'use client'

import { useEffect, useState } from 'react'
import NotFound from '@/app/not-found'
import { loadSharedChat, type SharedChat as Share } from '@/lib/assistantShare'
import { getBrowserClient } from '@/lib/supabase/client'
import { SharedChat } from './SharedChat'

/**
 * A chat shared in this browser: the standalone demo keeps the links of «Поделиться» in the browser
 * (src/lib/standalone/browser.ts), so the server has none and the page reads it here. Another browser has no such
 * link: it sees «Страница не найдена».
 */
export function LocalSharedChat({ id }: { id: string }) {
  const [share, setShare] = useState<Share | null | undefined>(undefined)
  useEffect(() => {
    const client = getBrowserClient()
    if (!client) return
    void loadSharedChat(client, id).then(setShare)
  }, [id])
  if (share === undefined) return null
  return share ? <SharedChat share={share} /> : <NotFound />
}
