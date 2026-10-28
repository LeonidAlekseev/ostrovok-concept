import 'server-only'
import { apiError } from '@/lib/api'
import type { ChatFailure } from '@/lib/db/hotelierChat'
import { CLOSED_ERROR, FORBIDDEN_ERROR, NOT_FOUND_ERROR, RATE_ERROR, STORE_ERROR } from './schema'

/** The answer of the chat routes to a refusal of the database. */
export const failureResponse = (failure: ChatFailure) =>
  ({
    forbidden: apiError(403, FORBIDDEN_ERROR),
    not_found: apiError(404, NOT_FOUND_ERROR),
    closed: apiError(409, CLOSED_ERROR),
    rate_limited: apiError(429, RATE_ERROR),
    store: apiError(503, STORE_ERROR),
  })[failure]

/** The JSON body of a request, or `undefined` when it is not JSON. */
export const jsonBody = (request: Request): Promise<unknown> => request.json().catch(() => undefined)
