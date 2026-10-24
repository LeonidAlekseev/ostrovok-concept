import type { Brief, Plan, Question } from './assistant'

/**
 * The single dialog of the older versions in sessionStorage: src/lib/assistantChats.ts reads it once into a chat
 * and erases it. A damaged or foreign value reads as no dialog; the ready-made route a plan of an older version
 * kept is dropped, its plan stays. The checks of a brief, a question and a plan serve the chats too.
 */

export interface DialogMessage {
  from: 'agent' | 'user'
  text: string
  plan?: Plan
}

export interface Dialog {
  messages: DialogMessage[]
  brief: Brief
  question: Question | null
}

export const DIALOG_KEY = 'ostrovok:v1:assistant'

type Shape = Record<string, unknown>
const isObject = (value: unknown): value is Shape =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export const isBrief = (value: unknown): value is Brief =>
  isObject(value) &&
  (value.vibe === undefined || isString(value.vibe)) &&
  (value.destinationId === undefined || isString(value.destinationId)) &&
  (value.when === undefined || isString(value.when) || isNumber(value.when)) &&
  (value.nights === undefined || isNumber(value.nights)) &&
  (value.party === undefined || isString(value.party)) &&
  (value.mood === undefined || isString(value.mood)) &&
  (value.budget === undefined || isNumber(value.budget)) &&
  (value.quiet === undefined || value.quiet === true) &&
  (value.height === undefined || isString(value.height)) &&
  (value.view === undefined || isString(value.view))

export const isQuestion = (value: unknown): value is Question =>
  isObject(value) &&
  isString(value.id) &&
  isString(value.text) &&
  Array.isArray(value.replies) &&
  value.replies.every(isString)

export const isPlan = (value: unknown): value is Plan =>
  isObject(value) &&
  isString(value.emoji) &&
  isString(value.atmosphere) &&
  isString(value.why) &&
  isObject(value.query) &&
  isString(value.query.checkIn) &&
  isString(value.query.checkOut) &&
  isObject(value.query.guests) &&
  isNumber(value.nights) &&
  typeof value.overBudget === 'boolean' &&
  Array.isArray(value.options) &&
  value.options.every(
    (o) =>
      isObject(o) &&
      isObject(o.destination) &&
      isString(o.destination.id) &&
      isString(o.destination.name) &&
      isString(o.destination.country) &&
      (o.hotel === undefined || (isObject(o.hotel) && isString(o.hotel.id) && isNumber(o.hotel.rating))) &&
      isNumber(o.total) &&
      typeof o.fitsBudget === 'boolean' &&
      (o.reasons === undefined || (Array.isArray(o.reasons) && o.reasons.every(isString))),
  )

const isMessage = (value: unknown): value is DialogMessage =>
  isObject(value) &&
  (value.from === 'agent' || value.from === 'user') &&
  isString(value.text) &&
  (value.plan === undefined || isPlan(value.plan))

function parse(value: unknown): Dialog | null {
  if (!isObject(value) || !Array.isArray(value.messages) || !value.messages.every(isMessage)) return null
  if (!isBrief(value.brief)) return null
  if (value.question !== null && !isQuestion(value.question)) return null
  // Only the known fields: a route of an older version stays behind.
  const messages = value.messages.map(({ from, text, plan }) => (plan ? { from, text, plan } : { from, text }))
  return { messages, brief: value.brief, question: value.question }
}

/** The saved dialog, or `null` if there is none, it is damaged, or the storage is unavailable. */
export function loadDialog(): Dialog | null {
  try {
    const raw = window.sessionStorage.getItem(DIALOG_KEY)
    const dialog = raw === null ? null : parse(JSON.parse(raw))
    return dialog && dialog.messages.length > 0 ? dialog : null
  } catch {
    return null
  }
}

/** Erases the old dialog once it has moved into a chat. */
export function clearDialog() {
  try {
    window.sessionStorage.removeItem(DIALOG_KEY)
  } catch {
    // Storage is disabled: there is nothing to erase.
  }
}
