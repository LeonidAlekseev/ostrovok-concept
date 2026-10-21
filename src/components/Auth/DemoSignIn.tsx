'use client'

import { useState } from 'react'
import { signInDemo } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { reloadSession } from '@/lib/session'
import { FormAlert } from './AuthForm'

/** «Войти в демо-аккаунт»: the shared account prepared by `npm run db:seed`, signed in on the server. */
export function DemoSignIn({ onDone }: { onDone: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function signIn() {
    setPending(true)
    setError(undefined)
    const result = await signInDemo()
    if (result.error) {
      setPending(false)
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
      <Button variant="secondary" size="lg" className="w-full" disabled={pending} onClick={signIn}>
        Войти в демо-аккаунт
      </Button>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  )
}
