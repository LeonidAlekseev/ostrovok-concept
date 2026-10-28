import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/db/database.types'
import { createClient } from '@/lib/supabase/server'
import { errorResult, toolResultSchema, type ToolResult, type ToolRun } from '@/lib/toolResult'

/**
 * The runs of Эвал's tools in `tool_runs` (supabase/migrations/20261027220000_claims_evidence_store.sql), written by
 * the route as the signed-in user: the client of the request with the user's session, under RLS «only the owner's», no
 * service role. A run is a row `running` before the tool works, then `success` or `error` with its summary, its result
 * and its end, and the sources it used in `tool_run_evidence`. A guest's run is not written: it lives in the answer and
 * in the message of the browser. A failure to write is logged briefly — never the user's data — and the answer comes
 * all the same.
 */

type Client = SupabaseClient<Database>

/** Who the runs are written for: the user of the session and their chat, checked. */
export interface RunOwner {
  client: Client
  userId: string
  chatId: string
  messageId: string | null
}

/** The code of a failure, never its message: it may quote the row. */
const warnRun = (what: string, error: unknown) =>
  console.warn(`tool_runs: ${what} (${String((error as { code?: unknown })?.code ?? 'error').slice(0, 40)})`)

/**
 * The owner of the runs of a request: the signed-in user (checked by Supabase Auth) whose chat `chatId` is — RLS
 * shows only their own chats, and the row is asked by their id as well. `null` for a guest, a chat that is not theirs
 * or not saved yet, or without Supabase: the runs are then not written.
 */
export async function runOwner(
  chatId: string | undefined,
  messageId: string | undefined,
  client?: Client | null,
): Promise<RunOwner | null> {
  if (!chatId) return null
  try {
    const supabase = client === undefined ? await createClient() : client
    if (!supabase) return null
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) return null
    const { data, error } = await supabase
      .from('assistant_chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) warnRun('chat not checked', error)
    if (error || !data) return null
    return { client: supabase, userId, chatId, messageId: messageId ?? null }
  } catch (error) {
    warnRun('no owner', error)
    return null
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The row `running` of a run; `false` when it was not written. */
async function startRun(owner: RunOwner, id: string, tool: string, input: string, startedAt: string) {
  const { error } = await owner.client.from('tool_runs').insert({
    id,
    chat_id: owner.chatId,
    user_id: owner.userId,
    message_id: owner.messageId,
    tool_name: tool,
    status: 'running',
    input_summary: input.slice(0, 2000),
    started_at: startedAt,
  })
  if (error) warnRun('not started', error)
  return !error
}

/** What a `pending` result waits for: the request its answer finishes the run by (`answer_hotelier_request`). */
const resumeOf = (result: ToolResult) => {
  const request = result.data?.request_id
  return typeof request === 'string' ? { request_id: request } : {}
}

/** The end of a run and its sources; a `pending` run waits (`waiting`) with what resumes it, without an end. */
async function finishRun(owner: RunOwner, id: string, result: ToolResult, startedAt: string) {
  // The end by the same clock as the start: the row's check wants it no earlier.
  const completedAt = new Date(Math.max(Date.now(), Date.parse(startedAt))).toISOString()
  const pending = result.status === 'pending'
  const { error } = await owner.client
    .from('tool_runs')
    .update({
      status: pending ? 'waiting' : result.status === 'error' ? 'error' : 'success',
      result_summary: result.summary.slice(0, 4000),
      result_data: result as unknown as Json,
      error: result.error,
      completed_at: pending ? null : completedAt,
      resume: pending ? resumeOf(result) : null,
    })
    .eq('id', id)
  if (error) return warnRun('not finished', error)
  const evidence = [...new Set(result.evidence.map((e) => e.id))].filter((e) => UUID.test(e))
  if (evidence.length === 0) return
  const { error: evidenceError } = await owner.client
    .from('tool_run_evidence')
    .insert(evidence.map((evidence_id) => ({ tool_run_id: id, user_id: owner.userId, evidence_id })))
  if (evidenceError) warnRun('sources not written', evidenceError)
}

/**
 * Runs a tool of the contract: its result validated (one off the contract is an error), and for a signed-in user's
 * chat (`owner`) its row of `tool_runs` written around it — `execute` gets the run's id when the row is there (a tool
 * that waits links it to what it waits for). Runs in parallel are rows of their own. Never throws.
 */
export async function recordRun(
  owner: RunOwner | null,
  tool: string,
  input: string,
  execute: (runId: string | null) => Promise<ToolResult>,
): Promise<ToolRun> {
  const id = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const started = owner ? await startRun(owner, id, tool, input, startedAt).catch(() => false) : false
  let result: ToolResult
  try {
    const parsed = toolResultSchema.safeParse(await execute(started ? id : null))
    result = parsed.success
      ? parsed.data
      : errorResult('invalid_result', 'Инструмент вернул данные не по контракту, они не показаны')
  } catch {
    result = errorResult('tool_failed', 'Инструмент не сработал')
  }
  if (owner && started) await finishRun(owner, id, result, startedAt).catch((error) => warnRun('not finished', error))
  return { id, result }
}
