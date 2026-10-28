// Turns the hoteliers' shareable answers whose knowledge failed or never ran into the hotel's knowledge again: the
// characteristics (claims `reported`), their documents for the search and the waiting runs of Эвал — what `after()` of
// the route does after an answer (src/lib/db/hotelierKnowledge.ts). The server retries a failed answer by itself a few
// times; this is the operator's re-run of any of them, whatever their pause and the ones out of tries too (`force`).
//   npm run db:hotelier-knowledge
// Idempotent: an answer already done is rewritten in place, its chunks embedded again only when their text changed.
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NVIDIA_API_KEY; prints counts, never the texts.
import { serviceClient as scriptClient } from './lib/node.ts'

const { processHotelierAnswer } = await import('../src/lib/db/hotelierKnowledge.ts')

const db = scriptClient()
const [requests, messages, evidence] = await Promise.all([
  db.from('hotelier_requests').select('answer_message_id').in('knowledge_status', ['queued', 'failed']),
  db
    .from('hotelier_messages')
    .select('id')
    .eq('sender', 'hotelier')
    .eq('shareable', true)
    .is('knowledge_revoked_at', null),
  db.from('evidence').select('external_id').eq('type', 'hotelier'),
])
for (const { error } of [requests, messages, evidence]) if (error) throw new Error(error.message)
const done = new Set((evidence.data ?? []).map((e) => e.external_id))
const ids = new Set([
  ...(requests.data ?? []).flatMap((r) => r.answer_message_id ?? []),
  ...(messages.data ?? []).map((m) => m.id).filter((id) => !done.has(id)),
])
const outcomes: Record<string, number> = {}
for (const id of ids) {
  const outcome = await processHotelierAnswer(id, { force: true })
  outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
}
console.log(`hotelier knowledge: ${ids.size} answers`, outcomes)
