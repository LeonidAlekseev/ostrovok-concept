'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { copyRouteToTrip } from '@/app/trip/actions'
import { Button, buttonVariants } from '@/components/ui/button'

const SLOW_MS = 10_000

/** Copies the route once on opening (the action opens the plan) and shows an error with «Попробовать ещё раз». */
export function CopyRoute({ routeId }: { routeId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const started = useRef(false)
  // A copy that does not answer in time (a navigation of the sign-in may swallow the first request) can be retried.
  const [slow, setSlow] = useState(false)

  const copy = () =>
    startTransition(async () => {
      setError(null)
      const result = await copyRouteToTrip(routeId)
      // On success the action opens the plan instead of returning.
      setError(result?.error ?? null)
    })

  useEffect(() => {
    // Strict mode runs the effect twice with the same ref: one copy.
    if (!started.current) {
      started.current = true
      copy()
    }
    const timer = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col items-start gap-4 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <h1 className="text-title font-bold">Повторить маршрут</h1>
      {error && !pending ? (
        <>
          <p role="alert">{error}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={copy}>Попробовать ещё раз</Button>
            {routeId && (
              <Link className={buttonVariants({ variant: 'outline' })} href={`/routes/${encodeURIComponent(routeId)}`}>
                К маршруту
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          <p aria-live="polite" className="text-muted-foreground">
            Копируем маршрут в ваши планы…
          </p>
          {slow && (
            <Button variant="outline" onClick={copy}>
              Попробовать ещё раз
            </Button>
          )}
        </>
      )}
    </main>
  )
}
