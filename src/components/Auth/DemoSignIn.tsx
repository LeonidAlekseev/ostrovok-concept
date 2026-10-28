'use client'

import { useEffect, useRef, useState } from 'react'
import { signInDemo, type DemoAccount } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { reloadSession } from '@/lib/session'
import { FormAlert } from './AuthForm'

/**
 * «Войти в демо-аккаунт» and «Демо отельер»: the shared accounts prepared by `npm run db:seed` and
 * `npm run db:hotelier`, signed in on the server. The hotelier's opens the panel /hotelier.
 */
export function DemoSignIn({ next, onDone }: { next?: string | null; onDone: () => void }) {
  const [pending, setPending] = useState<DemoAccount | null>(null)
  const [error, setError] = useState<string>()
  // With `next` the action redirects and nothing runs after it here: the sign-in form goes away with the page,
  // and the session is picked up then.
  const attempted = useRef(false)
  useEffect(
    () => () => {
      if (attempted.current) void reloadSession()
    },
    [],
  )

  async function signIn(account: DemoAccount) {
    setPending(account)
    setError(undefined)
    attempted.current = true
    const result = await signInDemo(next, account)
    if (result.error) {
      setPending(null)
      setError(result.error)
      return
    }
    await reloadSession()
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        или
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={pending !== null}
        onClick={() => signIn('traveller')}
      >
        Войти в демо-аккаунт
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending !== null}
        onClick={() => signIn('hotelier')}
      >
        Демо отельер
      </Button>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  )
}
