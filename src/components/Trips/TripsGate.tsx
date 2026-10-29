'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { useHydrated } from '@/hooks/useHydrated'
import { useSession } from '@/hooks/useStore'

export const pageClass =
  'mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]'

/**
 * Trips and the checkout that fills them need a session; bookings come from the storage, so nothing shows before
 * hydration. `title` and `hint` word the invitation to sign in.
 */
export function TripsGate({
  next,
  title = 'Войдите, чтобы увидеть поездки',
  hint = 'Вход нужен, чтобы открыть бронирования этого браузера.',
  children,
}: {
  next: string
  title?: string
  hint?: string
  children: ReactNode
}) {
  const hydrated = useHydrated()
  const session = useSession()

  if (!hydrated) return <p className="text-muted-foreground">Загружаем поездки…</p>
  if (!session) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-title font-bold tracking-[-0.02em]">{title}</h1>
        <p className="text-muted-foreground">{hint}</p>
        <Link className={buttonVariants()} href={`/login?next=${encodeURIComponent(next)}`}>
          Войти
        </Link>
      </div>
    )
  }
  return children
}
