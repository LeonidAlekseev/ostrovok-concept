'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { AuthMode } from './AuthForm'

const modes: { mode: AuthMode; label: string }[] = [
  { mode: 'login', label: 'Вход' },
  { mode: 'register', label: 'Регистрация' },
]

/** «Вход / Регистрация»: replaces the address, so a dialog stays an intercepted one and `next` is kept. */
export function AuthSwitch({ mode }: { mode: AuthMode }) {
  const query = useSearchParams().toString()
  return (
    <nav aria-label="Вход или регистрация" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {modes.map((item) => (
        <Link
          key={item.mode}
          href={`/${item.mode}${query ? `?${query}` : ''}`}
          replace
          scroll={false}
          aria-current={item.mode === mode ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-center text-sm font-[550] no-underline',
            item.mode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
