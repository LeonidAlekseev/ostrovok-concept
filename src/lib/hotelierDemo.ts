import { createHash } from 'node:crypto'
import type { HotelierFact } from './ai/hotelierExtract'
import type { ConversationKind, ConversationStatus, HotelierSender } from './hotelierChat'
import type { HotelierKey } from './hotelierFacts'

/**
 * The demonstration chats with the hoteliers (`npm run db:seed:hotelier-demo`): six real hotels of Valencia, each with
 * a scenario — a characteristic known from the hotelier's answer and answered by the hotel's AI assistant with its
 * source; one unknown and asked by Эвал, still waiting; answers that contradict each other and a request to clear it
 * up; a view asked by Эвал and answered; what only the hotel can guarantee, passed to the hotelier; and a private
 * answer kept out of the hotel's knowledge. Every text is synthetic and every row is flagged demonstration; the ids
 * are derived from the scenario's keys, so a second run finds its rows and adds none.
 */

/** The namespace of the demo rows' ids: `uuidv5(namespace, 'hotelier-demo:<key>')`. */
const NAMESPACE = 'b8d3f0a2-6c4e-4f1a-9b7d-2e5c8a1f4d60'

/** The id of a demo row: a UUID v5 of its key, the same on every run. */
export function demoId(key: string): string {
  const namespace = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(namespace).update(`hotelier-demo:${key}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface DemoMessage {
  key: string
  sender: HotelierSender
  text: string
  /** ISO time: the demo's week, 18–25 October 2026. */
  at: string
  /** The hotelier lets the answer's characteristics go to the hotel's knowledge. */
  shareable?: true
  /** The characteristics of a shareable answer, as the extraction would give them. */
  facts?: HotelierFact[]
  /** The answer contradicts the hotelier's earlier one: both stand, marked. */
  conflict?: true
  /** The request the message asks (the assistant's) or answers (the hotelier's). */
  request?: string
  /** The assistant's answer from the facts of that message, with their sources. */
  sourcesOf?: string
}

export interface DemoRequest {
  key: string
  question: string
  keys: HotelierKey[]
  context?: string
}

/** Эвал's chat of the traveller where the request was made: the question, Эвал's reply and the block. */
export interface DemoEvalChat {
  key: string
  question: string
  reply: string
  at: string
}

export interface DemoConversation {
  key: string
  hotelId: string
  kind: ConversationKind
  /** The state the conversation is left in once its messages are written. */
  status: ConversationStatus
  requests: DemoRequest[]
  messages: DemoMessage[]
  evalChat?: DemoEvalChat
}

const fact = (key: HotelierKey, value: string, room: string | null, statement: string, yes: boolean | null = null) => ({
  key,
  value,
  room,
  statement,
  yes,
})

const at = (day: number, time: string) => `2026-10-${String(day).padStart(2, '0')}T${time}:00.000Z`

/** The demo hotels: real hotels of Valencia (`ota-<master_id>`) with noise data and reviews. */
export const DEMO_HOTELS = {
  zenit: 'ota-7480809',
  vincci: 'ota-7481697',
  dwo: 'ota-7480161',
  solPlaya: 'ota-7568446',
  senator: 'ota-7831389',
  palace: 'ota-7481383',
} as const

export const DEMO_CONVERSATIONS: readonly DemoConversation[] = [
  {
    // Known: the hotelier told it, the assistant answers from it with the source.
    key: 'zenit-balcony',
    hotelId: DEMO_HOTELS.zenit,
    kind: 'user',
    status: 'resolved',
    requests: [],
    messages: [
      { key: 'zenit-1', sender: 'user', text: 'Здравствуйте! Есть ли балкон в номерах Superior?', at: at(20, '09:00') },
      {
        key: 'zenit-2',
        sender: 'hotelier',
        text: 'Здравствуйте! Да, у номеров Superior на 3–6 этажах есть небольшой балкон, окна выходят на улицу Bailén.',
        at: at(20, '11:30'),
        shareable: true,
        facts: [
          fact('room.balcony', 'есть', 'Superior', 'В номерах Superior есть небольшой балкон.', true),
          fact('room.floors', '3–6 этажи', 'Superior', 'Номера Superior на 3–6 этажах.'),
          fact('room.window_side', 'на улицу Bailén', 'Superior', 'Окна номеров Superior выходят на улицу Bailén.'),
        ],
      },
      {
        key: 'zenit-3',
        sender: 'user',
        text: 'Подскажите ещё раз: на каких этажах номера Superior с балконом?',
        at: at(21, '08:10'),
      },
      {
        key: 'zenit-4',
        sender: 'ai_assistant',
        text: 'По словам отельера, номера Superior с балконом — на 3–6 этажах.',
        at: at(21, '08:11'),
        sourcesOf: 'zenit-2',
      },
    ],
  },
  {
    // Unknown: Эвал asked the hotelier, the answer is still awaited — the demo hotelier can answer it live.
    key: 'vincci-windows',
    hotelId: DEMO_HOTELS.vincci,
    kind: 'ai_request',
    status: 'waiting_hotelier',
    evalChat: {
      key: 'vincci-chat',
      question: 'Окна номеров Standard выходят на улицу или во двор? Хочу тихий номер.',
      reply: 'В данных отеля этого нет — спросил отельера, ответ придёт в блок «Запрос отельеру».',
      at: at(24, '19:40'),
    },
    requests: [
      {
        key: 'vincci-request',
        question: 'С какой стороны выходят окна номеров Standard — на улицу или во двор? Слышен ли ночью шум с улицы?',
        keys: ['room.window_side', 'room.noise'],
        context: 'Гость выбирает тихий номер',
      },
    ],
    messages: [
      {
        key: 'vincci-1',
        sender: 'ai_assistant',
        text: 'С какой стороны выходят окна номеров Standard — на улицу или во двор? Слышен ли ночью шум с улицы?',
        at: at(24, '19:40'),
        request: 'vincci-request',
      },
    ],
  },
  {
    // The first answer about the rooms Premium of DWO: the yard, quiet.
    key: 'dwo-premium-first',
    hotelId: DEMO_HOTELS.dwo,
    kind: 'ai_request',
    status: 'open',
    requests: [{ key: 'dwo-request-1', question: 'Куда выходят окна номеров Premium?', keys: ['room.window_side'] }],
    messages: [
      {
        key: 'dwo-1',
        sender: 'ai_assistant',
        text: 'Куда выходят окна номеров Premium?',
        at: at(18, '10:00'),
        request: 'dwo-request-1',
      },
      {
        key: 'dwo-2',
        sender: 'hotelier',
        text: 'Номера Premium выходят окнами во внутренний двор, ночью тихо.',
        at: at(18, '14:20'),
        request: 'dwo-request-1',
        shareable: true,
        facts: [
          fact('room.window_side', 'во внутренний двор', 'Premium', 'Окна номеров Premium выходят во двор.'),
          fact('room.noise', 'ночью тихо', 'Premium', 'В номерах Premium ночью тихо.'),
        ],
      },
    ],
  },
  {
    // A later answer contradicts the first: both stand, marked, until the hotelier clears it up.
    key: 'dwo-premium-guest',
    hotelId: DEMO_HOTELS.dwo,
    kind: 'user',
    status: 'open',
    requests: [],
    messages: [
      {
        key: 'dwo-3',
        sender: 'user',
        text: 'Мне сказали, что номера Premium выходят во двор. Это точно?',
        at: at(24, '12:00'),
      },
      {
        key: 'dwo-4',
        sender: 'hotelier',
        text: 'Не все: часть номеров Premium выходит на улицу Pintor Sorolla, там вечером бывает шумно.',
        at: at(24, '13:05'),
        shareable: true,
        conflict: true,
        facts: [
          fact(
            'room.window_side',
            'часть — на улицу Pintor Sorolla',
            'Premium',
            'Часть номеров Premium выходит на улицу.',
          ),
          fact('room.noise', 'вечером бывает шумно', 'Premium', 'В номерах Premium на улицу вечером бывает шумно.'),
        ],
      },
    ],
  },
  {
    // Эвал asks the hotelier to clear the contradiction up.
    key: 'dwo-premium-clarify',
    hotelId: DEMO_HOTELS.dwo,
    kind: 'ai_request',
    status: 'waiting_hotelier',
    requests: [
      {
        key: 'dwo-request-2',
        question:
          'Ответы о номерах Premium расходятся: какие из них выходят во двор, а какие на улицу? Можно ли выбрать сторону при бронировании?',
        keys: ['room.window_side', 'room.noise'],
        context: 'Два ответа отельера о номерах Premium противоречат друг другу',
      },
    ],
    messages: [
      {
        key: 'dwo-5',
        sender: 'ai_assistant',
        text: 'Ответы о номерах Premium расходятся: какие из них выходят во двор, а какие на улицу? Можно ли выбрать сторону при бронировании?',
        at: at(24, '13:10'),
        request: 'dwo-request-2',
      },
    ],
  },
  {
    // A view asked by Эвал and answered: the block of the traveller's chat shows the answer and the facts.
    key: 'solplaya-view',
    hotelId: DEMO_HOTELS.solPlaya,
    kind: 'ai_request',
    status: 'open',
    evalChat: {
      key: 'solplaya-chat',
      question: 'Будет ли вид на море из апартаментов Classic?',
      reply: 'Спросил отельера: ответ придёт в блок «Запрос отельеру».',
      at: at(22, '09:15'),
    },
    requests: [
      { key: 'solplaya-request', question: 'Есть ли вид на море из апартаментов Classic?', keys: ['room.view'] },
    ],
    messages: [
      {
        key: 'solplaya-1',
        sender: 'ai_assistant',
        text: 'Есть ли вид на море из апартаментов Classic?',
        at: at(22, '09:15'),
        request: 'solplaya-request',
      },
      {
        key: 'solplaya-2',
        sender: 'hotelier',
        text: 'Из апартаментов Classic вид на город. Вид на море — из апартаментов Premium на 5–7 этажах.',
        at: at(22, '12:40'),
        request: 'solplaya-request',
        shareable: true,
        facts: [
          fact('room.view', 'на город', 'Classic', 'Из апартаментов Classic вид на город.'),
          fact('room.view', 'на море', 'Premium', 'Из апартаментов Premium вид на море.'),
          fact('room.floors', '5–7 этажи', 'Premium', 'Апартаменты Premium на 5–7 этажах.'),
        ],
      },
    ],
  },
  {
    // What only the hotel can guarantee: the assistant passes it to the hotelier.
    key: 'senator-floor',
    hotelId: DEMO_HOTELS.senator,
    kind: 'user',
    status: 'waiting_hotelier',
    requests: [
      {
        key: 'senator-request',
        question: 'Можно гарантированно получить номер на верхнем этаже, подальше от лифта?',
        keys: ['room.location', 'room.floors'],
      },
    ],
    messages: [
      {
        key: 'senator-1',
        sender: 'user',
        text: 'Можно гарантированно получить номер на верхнем этаже, подальше от лифта?',
        at: at(25, '08:30'),
      },
      {
        key: 'senator-2',
        sender: 'ai_assistant',
        text: 'Передал вопрос отельеру: он ответит здесь. Я не подтверждаю это сам без актуальных данных отеля.',
        at: at(25, '08:31'),
        request: 'senator-request',
      },
    ],
  },
  {
    // Quiet and the view known; a private answer about an early check-in stays out of the hotel's knowledge.
    key: 'palace-noise',
    hotelId: DEMO_HOTELS.palace,
    kind: 'user',
    status: 'resolved',
    requests: [],
    messages: [
      { key: 'palace-1', sender: 'user', text: 'Шумно ли ночью в номерах Superior с видом?', at: at(19, '18:00') },
      {
        key: 'palace-2',
        sender: 'hotelier',
        text: 'Номера Superior выходят на сад и русло Турии, ночью тихо. Кондиционер работает почти бесшумно.',
        at: at(19, '19:15'),
        shareable: true,
        facts: [
          fact('room.noise', 'ночью тихо', 'Superior', 'В номерах Superior ночью тихо.'),
          fact('room.view', 'на сад и русло Турии', 'Superior', 'Из номеров Superior вид на сад и русло Турии.'),
          fact(
            'room.air_conditioning',
            'почти бесшумный',
            'Superior',
            'Кондиционер в номерах Superior почти бесшумный.',
          ),
        ],
      },
      { key: 'palace-3', sender: 'user', text: 'Можно ли ранний заезд 3 ноября в 9 утра?', at: at(19, '19:30') },
      {
        key: 'palace-4',
        sender: 'hotelier',
        text: 'Да, для вас подготовим номер к 9:00.',
        at: at(19, '20:00'),
      },
      { key: 'palace-5', sender: 'user', text: 'Спасибо!', at: at(19, '20:05') },
    ],
  },
]

/** The model of the demo's facts in `method.extractor`: none extracted them, the demo knows them. */
export const DEMO_EXTRACTOR = 'hotelier-demo'
