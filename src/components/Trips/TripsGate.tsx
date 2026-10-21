'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { useHydrated } from '@/hooks/useHydrated'
import { useSession } from '@/hooks/useStore'

export const pageClass =
  'mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]'

/** Trips need a session; bookings come from the storage, so nothing shows before hydration. */
export function TripsGate({ next, children }: { next: string; children: ReactNode }) {
  const hydrated = useHydrated()
  const session = useSession()

  if (!hydrated) return <p className="text-muted-foreground">Загружаем поездки…</p>
  if (!session) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-title font-bold tracking-[-0.02em]">Войдите, чтобы увидеть поездки</h1>
        <p className="text-muted-foreground">Вход нужен, чтобы открыть бронирования этого браузера.</p>
        <Link className={buttonVariants()} href={`/login?next=${encodeURIComponent(next)}`}>
          Войти
        </Link>
      </div>
    )
  }
  return children
}
