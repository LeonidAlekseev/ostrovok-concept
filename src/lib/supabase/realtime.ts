import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

/**
 * What the browser's Realtime subscriptions share: a channel of its own for each subscription, joined with the user's
 * token, and the rows of its events.
 */

let channels = 0

/** A name no other channel of the page has: two subscriptions to one topic never share a channel. */
export const channelName = (topic: string) => `${topic}:${(channels += 1)}`

/**
 * The Realtime connection with the user's token before a channel joins: the browser's client connects with the anon
 * key, and the policies would refuse every row of the subscription (`Error 401: Unauthorized`).
 */
async function authorize(client: SupabaseClient) {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (token) await client.realtime.setAuth(token)
}

/** The channel joins once authorized, unless it was removed meanwhile; the returned function removes it. */
export function join(client: SupabaseClient, channel: RealtimeChannel): () => void {
  let removed = false
  void authorize(client)
    .catch(() => undefined)
    .then(() => {
      if (!removed) channel.subscribe()
    })
  return () => {
    removed = true
    void client.removeChannel(channel)
  }
}

/** The row of an event, or `null` for one the policies refused or a deletion. */
export const rowOf = <T>(payload: { new: unknown; errors?: unknown }): T | null => {
  const row = payload.new as { id?: unknown } | null
  return !payload.errors && row && typeof row.id === 'string' ? (row as T) : null
}
