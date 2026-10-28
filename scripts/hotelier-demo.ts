// Loads the demonstration chats with the hoteliers (src/lib/hotelierDemo.ts): six real hotels of Valencia with the
// traveller's questions, Эвал's requests, the demo hotelier's answers, the characteristics taken from them (claims
// `reported` with their source, the documents of the search with their vectors) and Эвал's chats with the block
// «Запрос отельеру». Everything is flagged demonstration (`is_demo`) and shown «демо».
//   npm run db:seed:hotelier-demo   (after npm run db:seed and npm run db:hotelier)
// Repeatable: the rows have ids derived from the scenario, a second run adds nothing and changes nothing a person
// changed since (a request answered live stays answered); it never touches rows it did not make. A user chat of the
// demo traveller with a hotel that is already open is left alone, and its scenario skipped. Needs
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL, DEMO_HOTELIER_EMAIL and, for the vectors,
// NVIDIA_API_KEY; prints counts, never the keys.
import { required, serviceClient, userIdByEmail } from './lib/node.ts'

const { DEMO_CONVERSATIONS, DEMO_EXTRACTOR, demoId } = await import('../src/lib/hotelierDemo.ts')
const { dedupeKey, writeHotelierFacts } = await import('../src/lib/db/hotelierKnowledge.ts')
const { characteristicLabel } = await import('../src/lib/hotelierFacts.ts')

type Demo = (typeof DEMO_CONVERSATIONS)[number]
type Written = NonNullable<Awaited<ReturnType<typeof writeHotelierFacts>>>

const db = serviceClient()
const accounts = await Promise.all([
  userIdByEmail(db, required('DEMO_USER_EMAIL')),
  userIdByEmail(db, required('DEMO_HOTELIER_EMAIL')),
])
if (!accounts[0] || !accounts[1]) throw new Error('demo accounts: run npm run db:seed and npm run db:hotelier first')
const [traveller, hotelier]: string[] = accounts as string[]

const counts: Record<string, number> = {}
const count = (what: string, n = 1) => (counts[what] = (counts[what] ?? 0) + n)

function check(what: string, error: { message: string; code?: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

/** Writes the row unless one with its id is there; `true` when it wrote it. */
async function insertOnce(table: string, row: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db
    .from(table as never)
    .upsert(row as never, { onConflict: 'id', ignoreDuplicates: true })
    .select('id')
  check(table, error)
  return (data as unknown[] | null)?.length === 1
}

const later = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString()

/** The result of «Запрос отельеру» as `create_hotelier_request` and `answer_hotelier_request` leave it. */
function askResult(demo: Demo, requestKey: string, answer?: { text: string; at: string }) {
  const request = demo.requests.find((r) => r.key === requestKey)!
  return {
    status: answer ? 'success' : 'pending',
    summary: answer ? `Отельер ответил: ${answer.text}`.slice(0, 1000) : 'Вопрос передан отельеру: ответ придёт сюда',
    data: {
      request_id: demoId(requestKey),
      hotel_id: demo.hotelId,
      request_status: answer ? 'answered' : 'pending',
      question: request.question,
      requested_characteristics: request.keys,
      reused: false,
      demo: true,
      ...(answer && { answer: answer.text, answered_at: answer.at, knowledge: 'queued' }),
    },
    evidence: [],
    claims: [],
    calculations: [],
    method: null,
    limitations: answer
      ? ['Характеристики из ответа извлекаются и появятся в этом блоке']
      : [
          'Отельер отвечает лично: ответ появится в этом блоке и в чате, когда он ответит',
          `Спрошено: ${request.keys.map(characteristicLabel).join(', ')}`,
        ],
    error: null,
  }
}

/** The traveller's chat with Эвал about the hotel: the question, the block of the request and Эвал's reply. */
async function evalChat(demo: Demo, hotelName: string) {
  const chat = demo.evalChat!
  const requestKey = demo.requests[0].key
  const answer = demo.messages.find((m) => m.sender === 'hotelier' && m.request === requestKey)
  const runId = demoId(`${chat.key}:run`)
  const result = askResult(demo, requestKey, answer && { text: answer.text, at: answer.at })
  if (
    await insertOnce('assistant_chats', {
      id: demoId(chat.key),
      user_id: traveller,
      title: chat.question.slice(0, 60),
      brief: { hotelId: demo.hotelId, destinationId: 'valencia' },
      created_at: chat.at,
      updated_at: answer?.at ?? chat.at,
    })
  )
    count('assistant chats')
  // The run waits for the hotelier; an answered one is finished as the hotelier's answer finishes it.
  await insertOnce('tool_runs', {
    id: runId,
    chat_id: demoId(chat.key),
    user_id: traveller,
    tool_name: 'ask_hotelier',
    status: answer ? 'success' : 'waiting',
    input_summary: `${hotelName} (${demo.hotelId})`,
    result_summary: result.summary,
    result_data: result,
    resume: answer ? null : { request_id: demoId(requestKey) },
    started_at: chat.at,
    completed_at: answer ? answer.at : null,
  })
  const step = {
    agent: 'hotelier',
    title: 'Запрос отельеру',
    params: demo.requests[0].keys.map(characteristicLabel).join(', '),
    result: result.summary.slice(0, 300),
    run: { id: runId, result },
  }
  const messages = [
    { key: 'question', role: 'user', text: chat.question, data: {}, at: chat.at },
    { key: 'step', role: 'agent', text: '', data: { step }, at: later(chat.at, 2) },
    { key: 'reply', role: 'assistant', text: chat.reply, data: {}, at: later(chat.at, 3) },
    ...(answer
      ? [
          {
            key: 'owner',
            role: 'owner',
            text: answer.text,
            data: { hotelierRequest: demoId(requestKey), demo: true },
            at: answer.at,
          },
        ]
      : []),
  ]
  for (const m of messages)
    await insertOnce('assistant_messages', {
      id: demoId(`${chat.key}:${m.key}`),
      chat_id: demoId(chat.key),
      user_id: traveller,
      role: m.role,
      status: 'done',
      text: m.text,
      data: m.data,
      created_at: m.at,
      updated_at: m.at,
    })
  return { chatId: demoId(chat.key), runId }
}

/** The assistant's answer from the facts of a message: the same block of sources as the live assistant's. */
const sourcesData = (text: string, written: Written) => ({
  run: {
    id: demoId(`sources:${text}`),
    result: {
      status: 'success',
      summary: text,
      data: null,
      evidence: [written.evidence],
      claims: written.claims,
      calculations: [],
      method: null,
      limitations: ['Ответ AI-помощника по сохранённым данным, не отельера'],
      error: null,
    },
  },
})

async function load(demo: Demo) {
  const { data: hotel, error } = await db
    .from('hotels')
    .select('id, name:data->>name')
    .eq('id', demo.hotelId)
    .maybeSingle()
  check('hotels', error)
  if (!hotel) {
    console.warn(`${demo.key}: no hotel ${demo.hotelId}, skipped`)
    count('skipped')
    return
  }
  const hotelName = String((hotel as { name?: unknown }).name ?? demo.hotelId)
  const origin = demo.evalChat ? await evalChat(demo, hotelName) : null
  const conversationId = demoId(demo.key)
  const conversation = await db
    .from('hotelier_conversations')
    .upsert(
      {
        id: conversationId,
        hotel_id: demo.hotelId,
        user_id: traveller,
        kind: demo.kind,
        status: 'open',
        ...(origin && { origin_chat_id: origin.chatId, origin_tool_run_id: origin.runId }),
        is_demo: true,
        created_at: demo.messages[0].at,
        last_message_at: demo.messages[0].at,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id')
  // The demo traveller's own open chat with the hotel is theirs: the scenario is not played over it.
  if (conversation.error?.code === '23505') {
    console.warn(`${demo.key}: the demo traveller already has an open chat with ${demo.hotelId}, skipped`)
    count('skipped')
    return
  }
  check('hotelier_conversations', conversation.error)
  const fresh = conversation.data?.length === 1
  if (fresh) count('conversations')

  for (const request of demo.requests)
    if (
      await insertOnce('hotelier_requests', {
        id: demoId(request.key),
        conversation_id: conversationId,
        hotel_id: demo.hotelId,
        user_id: traveller,
        question: request.question,
        characteristic_keys: request.keys,
        context_summary: request.context ?? null,
        dedupe_key: dedupeKey(demo.hotelId, request.question, request.keys),
        origin_chat_id: origin?.chatId ?? null,
        origin_tool_run_id: origin?.runId ?? null,
        created_at: demo.messages[0].at,
        expires_at: '2027-01-31T00:00:00.000Z',
      })
    )
      count('requests')

  // The messages in order: the trigger keeps the conversation's newest message and unread counts.
  const ids = demo.messages.map((m) => demoId(m.key))
  const { data: present, error: presentError } = await db.from('hotelier_messages').select('id').in('id', ids)
  check('hotelier_messages', presentError)
  const there = new Set((present ?? []).map((m) => m.id))
  const written = new Map<string, Written>()
  const factsOf = async (key: string) => {
    if (!written.has(key)) {
      const message = demo.messages.find((m) => m.key === key)!
      const result = await writeHotelierFacts(demoId(key), message.facts ?? [], {
        model: DEMO_EXTRACTOR,
        conflict: message.conflict === true,
      })
      if (result) written.set(key, result)
    }
    return written.get(key)
  }
  for (const message of demo.messages) {
    const id = demoId(message.key)
    if (!there.has(id)) {
      const source = message.sourcesOf ? await factsOf(message.sourcesOf) : undefined
      const { error: messageError } = await db.from('hotelier_messages').insert({
        id,
        conversation_id: conversationId,
        sender: message.sender,
        author_id: message.sender === 'user' ? traveller : message.sender === 'hotelier' ? hotelier : null,
        text: message.text,
        data: source ? sourcesData(message.text, source) : {},
        request_id: message.request ? demoId(message.request) : null,
        shareable: message.shareable === true,
        is_demo: true,
        created_at: message.at,
      })
      check('hotelier_messages', messageError)
      count('messages')
    }
    // The hotelier's answer to a request finishes it, as `answer_hotelier_request` does for a live answer.
    if (message.sender === 'hotelier' && message.request) await answer(demo, message)
    // The characteristics of a shareable answer, once: an answer whose source is stored is done.
    if (message.facts?.length) {
      const { data: stored } = await db.from('evidence').select('id').eq('type', 'hotelier').eq('external_id', id)
      if (!stored?.length && (await factsOf(message.key))) count('answers with characteristics')
    }
  }
  if (fresh && demo.status !== 'open') {
    // A resolved demo chat was read by both sides; the others keep their unread answers to show.
    const { error: statusError } = await db
      .from('hotelier_conversations')
      .update({ status: demo.status, ...(demo.status === 'resolved' && { user_unread: 0, hotelier_unread: 0 }) })
      .eq('id', conversationId)
    check('hotelier_conversations', statusError)
  }
}

/** A request the demo hotelier answers: answered, its run finished, unless it was answered already. */
async function answer(demo: Demo, message: Demo['messages'][number]) {
  const requestId = demoId(message.request!)
  const { data, error } = await db
    .from('hotelier_requests')
    .update({
      status: 'answered',
      answered_at: message.at,
      answer_message_id: demoId(message.key),
      knowledge_status: message.shareable ? 'queued' : 'done',
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
  check('hotelier_requests', error)
  if (!data?.length) return
  count('answered requests')
  if (!demo.evalChat) return
  const result = askResult(demo, message.request!, { text: message.text, at: message.at })
  const runId = demoId(`${demo.evalChat.key}:run`)
  const { error: runError } = await db
    .from('tool_runs')
    .update({
      status: 'success',
      result_data: result,
      result_summary: result.summary,
      resume: null,
      completed_at: message.at,
    })
    .eq('id', runId)
    .eq('status', 'waiting')
  check('tool_runs', runError)
}

for (const demo of DEMO_CONVERSATIONS) await load(demo)
console.log('hotelier demo:', counts)
