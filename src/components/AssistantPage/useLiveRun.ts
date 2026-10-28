'use client'

import { useEffect, useState } from 'react'
import type { Tables } from '@/lib/db/database.types'
import { isOpenRequest, requestStage, requestViewOf } from '@/lib/hotelierRequest'
import { join, rowOf, channelName } from '@/lib/supabase/realtime'
import { getBrowserClient } from '@/lib/supabase/client'
import { parseToolRun, type ToolRun } from '@/lib/toolResult'

type ToolRunRow = Tables<'tool_runs'>

/**
 * The run of «Запрос отельеру» as `tool_runs` has it now: the step of a message may be older than the hotelier's
 * answer (saved before it, or a reload of an old feed), so a request still open is read from the table once and
 * followed by Realtime until it is answered and its characteristics are in. A later change of a finished block — the
 * hotelier withdrew its characteristics — comes with the chat's message (`mergeServerMessage`): of the two copies the
 * one further on is shown. Any other run is shown as it is.
 */
export function useLiveRun(run: ToolRun): ToolRun {
  const [live, setLive] = useState<ToolRun | null>(null)
  const current =
    live && live.id === run.id && requestStage(requestViewOf(live.result)) > requestStage(requestViewOf(run.result))
      ? live
      : run
  const view = requestViewOf(current.result)
  const open = view !== null && isOpenRequest(view)

  useEffect(() => {
    const client = getBrowserClient()
    if (!open || !client) return
    let active = true
    const take = (row: Pick<ToolRunRow, 'id' | 'result_data'> | null) => {
      const next = row && parseToolRun({ id: row.id, result: row.result_data })
      if (active && next) setLive(next)
    }
    const stop = join(
      client,
      client
        .channel(channelName(`tool-run:${run.id}`))
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tool_runs', filter: `id=eq.${run.id}` },
          (payload) => take(rowOf<ToolRunRow>(payload)),
        ),
    )
    void client
      .from('tool_runs')
      .select('id, result_data')
      .eq('id', run.id)
      .maybeSingle()
      .then(({ data }) => take(data))
    return () => {
      active = false
      stop()
    }
  }, [open, run.id])

  return current
}
