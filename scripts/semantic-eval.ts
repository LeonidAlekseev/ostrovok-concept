// The semantic search's quality on the live database, outside CI: Russian queries with a rule for the hotels
// that answer them; for each, the relevant hotels in the top 5 by the vectors alone and after the reranker.
//   npm run db:embed && node --env-file=.env.local scripts/semantic-eval.ts [--plain-query]
// `--plain-query` embeds the queries as documents (`input_type: passage`), to see what the asymmetric mode gives.
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and NVIDIA_API_KEY; at most 40 requests a minute,
// a 429 waits and tries again; prints no keys.
import { registerHooks } from 'node:module'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/db/database.types.ts'
import { embed, rerank } from 'ai'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})

const { embeddingModel, toVector } = await import('../src/lib/ai/embedding.ts')
const { NVIDIA_KEY, pacer, withRetry } = await import('../src/lib/ai/nvidia.ts')
const { nvidiaReranker } = await import('../src/lib/ai/rerank.ts')

type Destination = import('../src/data/destinations.ts').Destination
type Hotel = import('../src/lib/catalog.ts').Hotel

const { values: options } = parseArgs({ options: { 'plain-query': { type: 'boolean' } } })

const TOP = 5
const CANDIDATES = 30

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const apiKey = required(NVIDIA_KEY)
const supabase = createClient<Database>(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  {
    auth: { persistSession: false },
  },
)
const queryModel = embeddingModel(apiKey, options['plain-query'] ? 'passage' : 'query')
const turn = pacer()
/** One request to the API and its own time: waits its turn under the limit, a 429 or a 5xx is tried again. */
const request = <T>(call: () => Promise<T>) =>
  withRetry(
    async () => {
      await turn()
      const start = performance.now()
      return { ...(await call()), ms: performance.now() - start }
    },
    { onRetry: (message) => console.warn(message) },
  )

const read = async <T>(table: 'destinations' | 'hotels') => {
  const { data, error } = await supabase.from(table).select('data').range(0, 9999)
  if (error) throw new Error(`${table}: ${error.message}`)
  return (data as unknown as { data: T }[]).map((row) => row.data)
}
const destinations = await read<Destination>('destinations')
const hotels = new Map((await read<Hotel>('hotels')).map((h) => [h.id, h]))
const sea = new Set(destinations.filter((d) => d.scenarios.includes('sea')).map((d) => d.id))
const has = (h: Hotel, amenity: Hotel['amenities'][number]) => h.amenities.includes(amenity)

/** The queries and the hotels that answer them. */
const QUERIES: [query: string, relevant: (h: Hotel) => boolean][] = [
  ['тихий хостел с быстрым Wi‑Fi в Праге', (h) => h.destinationId === 'prague' && h.stayType === 'hostel'],
  ['вилла у моря на большую компанию', (h) => sea.has(h.destinationId) && h.stayType === 'villa'],
  [
    'апартаменты для удалённой работы: рабочее место и быстрый интернет',
    (h) => h.stayType === 'apartments' && h.workspace && h.wifiMbps >= 100,
  ],
  ['недорогой хостел в Токио', (h) => h.destinationId === 'tokyo' && h.stayType === 'hostel'],
  ['отель со спа и бассейном в Анталье', (h) => h.destinationId === 'antalya' && (has(h, 'spa') || has(h, 'pool'))],
  ['пятизвёздочный отель в Дубае', (h) => h.destinationId === 'dubai' && h.stayType === 'hotel' && h.stars === 5],
  ['своя вилла в Сочи', (h) => h.destinationId === 'sochi' && h.stayType === 'villa'],
  ['апартаменты в центре Лиссабона', (h) => h.destinationId === 'lisbon' && h.stayType === 'apartments'],
  ['отель с баром для вечеринок в Барселоне', (h) => h.destinationId === 'barcelona' && has(h, 'bar')],
  ['тихое место подальше от суеты на Закинфе', (h) => h.destinationId === 'zakynthos' && h.distanceKm >= 3],
  ['дешёвый хостел в Стамбуле для студента', (h) => h.destinationId === 'istanbul' && h.stayType === 'hostel'],
  [
    'романтический отель для двоих в Париже',
    (h) => h.destinationId === 'paris' && h.stayType === 'hotel' && h.stars >= 4,
  ],
  ['семейный отдых у моря с бассейном в Канкуне', (h) => h.destinationId === 'cancun' && has(h, 'pool')],
  ['поработать из Тбилиси: рабочее место и хороший Wi‑Fi', (h) => h.destinationId === 'tbilisi' && h.workspace],
  ['роскошный отель в Нью-Йорке', (h) => h.destinationId === 'new-york' && h.stayType === 'hotel' && h.stars === 5],
]

interface Match {
  ref_id: string
  content: string
}

const rows: string[] = []
const totals = { before: 0, after: 0, ideal: 0, top1Before: 0, top1After: 0 }
const timings = { embed: 0, vectors: 0, rerank: 0 }
for (const [query, relevant] of QUERIES) {
  const { embedding, ms: embedMs } = await request(() => embed({ model: queryModel, value: query, maxRetries: 0 }))
  const t1 = performance.now()
  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: toVector(embedding),
    match_kind: 'hotel',
    match_count: CANDIDATES,
  })
  if (error) throw new Error(`match_embeddings: ${error.message}`)
  const matches = data as Match[]
  const t2 = performance.now()
  const { ranking, ms: rerankMs } = await request(() =>
    rerank({
      model: nvidiaReranker(apiKey),
      query,
      documents: matches.map((m) => m.content),
      topN: TOP,
      maxRetries: 0,
    }),
  )
  timings.embed += embedMs
  timings.vectors += t2 - t1
  timings.rerank += rerankMs

  const ok = (id: string) => relevant(hotels.get(id)!)
  const before = matches.slice(0, TOP).map((m) => m.ref_id)
  const after = ranking.map((r) => matches[r.originalIndex].ref_id)
  const ideal = Math.min(TOP, [...hotels.values()].filter(relevant).length)
  const hits = (ids: string[]) => ids.filter(ok).length
  totals.before += hits(before)
  totals.after += hits(after)
  totals.ideal += ideal
  totals.top1Before += Number(ok(before[0]))
  totals.top1After += Number(ok(after[0]))
  rows.push(
    `| ${query} | ${hits(before)}/${ideal} | ${hits(after)}/${ideal} | ${after[0]}${ok(after[0]) ? '' : ' ✗'} |`,
  )
}

const n = QUERIES.length
console.log(`| Запрос | top-5 векторы | top-5 реранк | первый после реранка |`)
console.log(`|---|---|---|---|`)
console.log(rows.join('\n'))
console.log(
  `| Итого | ${totals.before}/${totals.ideal}, первый ${totals.top1Before}/${n} | ` +
    `${totals.after}/${totals.ideal}, первый ${totals.top1After}/${n} | |`,
)
console.log(
  `\nСреднее время, мс: эмбеддинг ${Math.round(timings.embed / n)}, pgvector ${Math.round(timings.vectors / n)}, ` +
    `реранк ${CANDIDATES}→${TOP} ${Math.round(timings.rerank / n)}`,
)
