'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { resolveNext } from '@/lib/auth'
import { AuthForm, type AuthMode } from './AuthForm'
import { AuthSwitch } from './AuthSwitch'

const title: Record<AuthMode, string> = { login: 'Вход', register: 'Регистрация' }
const lead: Record<AuthMode, string> = {
  login: 'Войдите, чтобы видеть поездки и избранное.',
  register: 'Создайте демо-аккаунт, чтобы сохранять поездки и избранное.',
}

function Content({ mode, modal }: { mode: AuthMode; modal: boolean }) {
  const router = useRouter()
  const next = resolveNext(useSearchParams().get('next'))

  // The dialog goes back to the page under it unless `next` is given; the full page has no page under it.
  const done = () => (next ? router.replace(next) : modal ? router.back() : router.replace('/'))

  const Title = modal ? DialogTitle : 'h1'
  const Lead = modal ? DialogDescription : 'p'
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 pr-8">
          <Title className="text-title leading-tight font-bold tracking-[-0.02em]">{title[mode]}</Title>
          <Lead className="text-sm text-muted-foreground">{lead[mode]}</Lead>
        </div>
        <AuthSwitch mode={mode} />
      </div>
      <AuthForm key={mode} mode={mode} onDone={done} />
    </>
  )
}

/** The full page `/login` or `/register`. */
export function AuthPage({ mode }: { mode: AuthMode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <Suspense>
        <Content mode={mode} modal={false} />
      </Suspense>
    </main>
  )
}

/** The same content in a dialog over the current page: the intercepted `/login` or `/register`. */
export function AuthDialog({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent showCloseButton className="gap-4 sm:max-w-md">
        <Suspense>
          <Content mode={mode} modal />
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}
