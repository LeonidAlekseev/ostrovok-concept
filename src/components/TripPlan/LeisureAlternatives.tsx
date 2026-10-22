'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatPrice } from '@/lib/format'
import { ALTERNATIVES_ERROR, type LeisureFields, type TripLeisure } from '@/lib/trip'

type State = { status: 'loading' } | { status: 'done'; options: LeisureFields[] } | { status: 'error'; message: string }

interface Props {
  tripId: string
  start: string
  /** The item to replace; `null` keeps the dialog closed. */
  item: TripLeisure | null
  onClose: () => void
  onPick: (fields: LeisureFields) => void
}

/**
 * «Предложить другое»: asks the model for three alternatives of the item only when opened, and the picked one
 * takes its place. An error or a timeout says so and keeps the plan as it was; «Попробовать ещё раз» asks again.
 */
export function LeisureAlternatives({ tripId, start, item, onClose, onPick }: Props) {
  const [attempt, setAttempt] = useState(0)
  const key = item ? `${item.id}:${attempt}` : null
  const [state, setState] = useState<{ key: string | null; value: State }>({ key: null, value: { status: 'loading' } })

  useEffect(() => {
    if (!item || !key) return
    const controller = new AbortController()
    fetch(`/api/trips/${tripId}/alternatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leisure: item, start }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { options?: LeisureFields[]; error?: string }
        if (!response.ok || !body.options) throw new Error(body.error || ALTERNATIVES_ERROR)
        setState({ key, value: { status: 'done', options: body.options } })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message =
          error instanceof Error && error.message !== 'Failed to fetch' ? error.message : ALTERNATIVES_ERROR
        setState({ key, value: { status: 'error', message } })
      })
    return () => controller.abort()
    // The key stands for the item and the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const value: State = state.key === key ? state.value : { status: 'loading' }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-heading font-bold">Предложить другое</DialogTitle>
          {item && (
            <DialogDescription>
              Вместо «{item.title}» в день {item.day}, в {item.time}.
            </DialogDescription>
          )}
        </DialogHeader>
        {value.status === 'loading' && (
          <p aria-live="polite" className="text-muted-foreground">
            Подбираем варианты…
          </p>
        )}
        {value.status === 'error' && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert">{value.message}</p>
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Попробовать ещё раз
            </Button>
          </div>
        )}
        {value.status === 'done' && (
          <ul aria-label="Варианты" className="flex flex-col gap-2">
            {value.options.map((option) => (
              <li key={option.title} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3">
                <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                  <p className="font-semibold">{option.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {option.category} · {option.minutes} мин · {option.price ? formatPrice(option.price) : 'бесплатно'}
                  </p>
                </div>
                <Button size="sm" aria-label={`Выбрать: ${option.title}`} onClick={() => onPick(option)}>
                  Выбрать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
