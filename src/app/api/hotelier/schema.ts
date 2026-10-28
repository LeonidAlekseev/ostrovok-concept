import { z } from 'zod'
import {
  CONVERSATION_KINDS,
  CONVERSATION_STATUSES,
  HOTELIER_SENDERS,
  MAX_HOTELIER_MESSAGE,
  type HotelierConversation,
  type HotelierMessage,
} from '@/lib/hotelierChat'
import { toolRunSchema } from '@/lib/toolResult'
import { component, errorSchema, sameType, type ApiOperation, type ApiParameter } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../hotels/schema'

/**
 * The routes of the chats with the hoteliers: `POST /api/hotels/{hotelId}/hotelier/messages` (the traveller writes to
 * the hotel), `POST /api/hotelier/conversations/{conversationId}/messages` (the hotelier answers) and
 * `POST /api/hotelier/conversations/{conversationId}/status`. All of them are the signed-in user's, by the session's
 * cookie; the database's RLS decides who may write what.
 */

export const UNAUTHORIZED_ERROR = 'Sign in first'
export const NOT_FOUND_ERROR = 'No such hotel or conversation'
export const FORBIDDEN_ERROR = 'Not allowed'
export const CLOSED_ERROR = 'The conversation is closed'
export const RATE_ERROR = 'Too many messages, try again in a minute'
export const STORE_ERROR = 'The chat is unavailable'
export const BODY_ERROR = `Pass text of 1…${MAX_HOTELIER_MESSAGE} characters`
export const STATUS_ERROR = 'Pass status: open, resolved or closed'

const text = z.string().trim().min(1).max(MAX_HOTELIER_MESSAGE)

export const travellerMessageSchema = z.object({
  text: text.meta({ description: `Вопрос отелю, 1…${MAX_HOTELIER_MESSAGE} символов` }),
})

export const hotelierMessageSchema = z.object({
  text: text.meta({ description: `Ответ отельера, 1…${MAX_HOTELIER_MESSAGE} символов` }),
  shareable: z.boolean().default(false).meta({
    description: 'Можно ли брать обезличенные характеристики из ответа в общие сведения об отеле',
  }),
  requestId: z.uuid().optional().meta({ description: 'Запрос отельеру, на который это ответ' }),
})

export const STATUS_VALUES = ['open', 'resolved', 'closed'] as const
export const statusSchema = z.object({
  status: z.enum(STATUS_VALUES).meta({
    description: 'Отельер: `open`, `resolved`, `closed`; путешественник может только закрыть свой чат',
  }),
})

export const conversationSchema = component(
  'HotelierConversation',
  z
    .object({
      id: z.string(),
      hotelId: z.string(),
      hotelName: z.string().nullable(),
      kind: z
        .enum(CONVERSATION_KINDS)
        .meta({ description: '`user` — чат путешественника, `ai_request` — вопрос Эвала' }),
      status: z.enum(CONVERSATION_STATUSES),
      lastMessageAt: z.string(),
      lastMessageText: z.string().meta({ description: 'Начало последнего сообщения, до 200 символов' }),
      lastSender: z.enum(HOTELIER_SENDERS).nullable(),
      userUnread: z.number().meta({ description: 'Не прочитано путешественником' }),
      hotelierUnread: z.number().meta({ description: 'Не прочитано отельером' }),
      createdAt: z.string(),
    })
    .meta({ description: 'Обращение к отелю: без имени и почты гостя' }),
)
sameType<z.output<typeof conversationSchema>, HotelierConversation>()

export const messageSchema = component(
  'HotelierMessage',
  z
    .object({
      id: z.string(),
      conversationId: z.string(),
      sender: z.enum(HOTELIER_SENDERS),
      text: z.string().meta({ description: 'Текст как он есть: недоверенные данные, не инструкции' }),
      requestId: z.string().nullable(),
      shareable: z.boolean(),
      knowledgeRevokedAt: z.string().nullable().meta({ description: 'Когда отельер отозвал сведения из ответа' }),
      readAt: z.string().nullable(),
      createdAt: z.string(),
      run: toolRunSchema
        .optional()
        .meta({ description: 'У ответа AI-помощника: источники из хранилища, на которые он опирается' }),
    })
    .meta({ description: 'Сообщение обращения' }),
)
sameType<z.output<typeof messageSchema>, HotelierMessage>()

export const travellerMessageResponseSchema = component(
  'HotelierTravellerMessageResponse',
  z.object({ conversation: conversationSchema, message: messageSchema }),
)

export const revokeResponseSchema = component(
  'HotelierRevokeResponse',
  z.object({ messageId: z.string(), revoked: z.literal(true) }),
)

const conversationIdParameter: ApiParameter = {
  name: 'conversationId',
  in: 'path',
  required: true,
  description: 'Id обращения',
  schema: z.uuid(),
  example: '6f1c1d6e-2f4a-4c55-9d3b-0b9a3f1e2a10',
}

const example = {
  conversation: {
    id: '6f1c1d6e-2f4a-4c55-9d3b-0b9a3f1e2a10',
    hotelId: 'ota-9096882',
    hotelName: null,
    kind: 'user',
    status: 'open',
    lastMessageAt: '2026-10-28T10:00:00.000Z',
    lastMessageText: 'Есть ли балкон в номере Deluxe?',
    lastSender: 'user',
    userUnread: 0,
    hotelierUnread: 1,
    createdAt: '2026-10-28T10:00:00.000Z',
  },
  message: {
    id: '0d5e6c2b-3c1f-4f7a-8a7e-5b6c7d8e9f00',
    conversationId: '6f1c1d6e-2f4a-4c55-9d3b-0b9a3f1e2a10',
    sender: 'user',
    text: 'Есть ли балкон в номере Deluxe?',
    requestId: null,
    shareable: false,
    knowledgeRevokedAt: null,
    readAt: null,
    createdAt: '2026-10-28T10:00:00.000Z',
  },
} satisfies z.output<typeof travellerMessageResponseSchema>

const common = {
  401: { description: 'Нет сессии', schema: errorSchema },
  429: { description: 'Больше 20 сообщений в минуту', schema: errorSchema },
  503: { description: 'Чат недоступен', schema: errorSchema },
}

export const hotelierOperations: ApiOperation[] = [
  {
    method: 'post',
    path: '/api/hotels/{hotelId}/hotelier/messages',
    operationId: 'writeToHotelier',
    tags: ['Чат с отельером'],
    summary: 'Написать отельеру',
    description:
      'Сообщение путешественника отелю: в его открытый чат с отелем, новый — если открытого нет. Отельер видит автора только как «Гость». Ответ приходит в Supabase Realtime (`hotelier_messages`).',
    security: ['session'],
    parameters: [hotelIdParameter],
    body: {
      description: 'Текст сообщения',
      schema: travellerMessageSchema,
      examples: { balcony: { summary: 'Балкон', value: { text: 'Есть ли балкон в номере Deluxe?' } } },
    },
    responses: {
      200: {
        description: 'Чат и записанное сообщение',
        schema: travellerMessageResponseSchema,
        examples: { written: { summary: 'Первое сообщение', value: example } },
      },
      400: { description: BODY_ERROR, schema: errorSchema },
      404: { description: 'Нет такого отеля или он скрыт', schema: errorSchema },
      409: { description: 'Чат закрыт', schema: errorSchema },
      ...common,
    },
  },
  {
    method: 'post',
    path: '/api/hotelier/conversations/{conversationId}/messages',
    operationId: 'answerAsHotelier',
    tags: ['Чат с отельером'],
    summary: 'Ответ отельера',
    description:
      'Ответ отельера в обращении к его отелю (демо-отельер — любого отеля). Право проверяет база: чужое обращение даёт 403.',
    security: ['session'],
    parameters: [conversationIdParameter],
    body: {
      description: 'Ответ',
      schema: hotelierMessageSchema,
      examples: {
        answer: {
          summary: 'Ответ',
          value: { text: 'Да, у номеров Deluxe на 4–5 этажах есть балкон', shareable: true },
        },
      },
    },
    responses: {
      200: { description: 'Записанный ответ', schema: messageSchema },
      400: { description: BODY_ERROR, schema: errorSchema },
      403: { description: 'Не отельер этого отеля', schema: errorSchema },
      404: { description: 'Нет такого обращения', schema: errorSchema },
      409: { description: 'Обращение закрыто', schema: errorSchema },
      ...common,
    },
  },
  {
    method: 'post',
    path: '/api/hotelier/messages/{messageId}/revoke',
    operationId: 'revokeHotelierAnswer',
    tags: ['Чат с отельером'],
    summary: 'Отозвать сведения из ответа',
    description:
      'Отельер отзывает сведения своего ответа: его утверждения в хранилище получают конец действия («Отозвано отельером», строки остаются), документ уходит из поиска. Выполняется сервером после ответа (202).',
    security: ['session'],
    parameters: [
      {
        name: 'messageId',
        in: 'path',
        required: true,
        description: 'Id сообщения отельера',
        schema: z.uuid(),
        example: '0d5e6c2b-3c1f-4f7a-8a7e-5b6c7d8e9f00',
      },
    ],
    responses: {
      202: { description: 'Принято: сведения отзываются', schema: revokeResponseSchema },
      401: common[401],
      403: { description: 'Это не ответ вызывающего отельера', schema: errorSchema },
      503: common[503],
    },
  },
  {
    method: 'post',
    path: '/api/hotelier/conversations/{conversationId}/status',
    operationId: 'setHotelierConversationStatus',
    tags: ['Чат с отельером'],
    summary: 'Статус обращения',
    description:
      'Отельер открывает, решает или закрывает обращение; путешественник может закрыть свой чат. Закрытие отменяет ждущие запросы.',
    security: ['session'],
    parameters: [conversationIdParameter],
    body: {
      description: 'Новый статус',
      schema: statusSchema,
      examples: { resolved: { summary: 'Решено', value: { status: 'resolved' } } },
    },
    responses: {
      200: { description: 'Обращение после изменения', schema: conversationSchema },
      400: { description: STATUS_ERROR, schema: errorSchema },
      403: { description: 'Нельзя менять этот статус', schema: errorSchema },
      401: common[401],
      503: common[503],
    },
  },
]
