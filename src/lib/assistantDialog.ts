import type { Brief, Plan, Question } from './assistant'
import type { RouteCardData } from './routes'

/**
 * The assistant's dialog in sessionStorage, so a reload of the tab keeps what Эвал has already written down.
 * The pending reply is not kept. A damaged or foreign value reads as no dialog.
 */

export interface DialogMessage {
  from: 'agent' | 'user'
  text: string
  plan?: Plan
  /** The ready-made route over the plan's options. */
  route?: RouteCardData | null
}

export interface Dialog {
  messages: DialogMessage[]
  brief: Brief
  question: Question | null
}

export const DIALOG_KEY = 'ostrovok:v1:assistant'

type Shape = Record<string, unknown>
const isObject = (value: unknown): value is Shape => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isBrief = (value: unknown): value is Brief =>
  isObject(value) &&
  (value.vibe === undefined || isString(value.vibe)) &&
  (value.destinationId === undefined || isString(value.destinationId)) &&
  (value.when === undefined || isString(value.when) || isNumber(value.when)) &&
  (value.nights === undefined || isNumber(value.nights)) &&
  (value.party === undefined || isString(value.party)) &&
  (value.mood === undefined || isString(value.mood)) &&
  (value.budget === undefined || isNumber(value.budget))

const isQuestion = (value: unknown): value is Question =>
  isObject(value) &&
  isString(value.id) &&
  isString(value.text) &&
  Array.isArray(value.replies) &&
  value.replies.every(isString)

const isPlan = (value: unknown): value is Plan =>
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
      typeof o.fitsBudget === 'boolean',
  )

const isRoute = (value: unknown) => isObject(value) && isString(value.id) && isString(value.title)

const isMessage = (value: unknown): value is DialogMessage =>
  isObject(value) &&
  (value.from === 'agent' || value.from === 'user') &&
  isString(value.text) &&
  (value.plan === undefined || isPlan(value.plan)) &&
  (value.route === undefined || value.route === null || isRoute(value.route))

function parse(value: unknown): Dialog | null {
  if (!isObject(value) || !Array.isArray(value.messages) || !value.messages.every(isMessage)) return null
  if (!isBrief(value.brief)) return null
  if (value.question !== null && !isQuestion(value.question)) return null
  return { messages: value.messages, brief: value.brief, question: value.question }
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

/** Saves the dialog; an empty one erases it. Without storage the dialog just lives in memory. */
export function saveDialog(dialog: Dialog) {
  try {
    if (dialog.messages.length === 0) window.sessionStorage.removeItem(DIALOG_KEY)
    else window.sessionStorage.setItem(DIALOG_KEY, JSON.stringify(dialog))
  } catch {
    // Storage is full or disabled: the chat keeps working, the dialog is not kept.
  }
}
