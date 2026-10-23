'use client'

import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSession } from '@/hooks/useStore'
import { signOut } from '@/lib/session'

const linkClass = 'block rounded-md p-3 font-[550] text-foreground no-underline hover:bg-muted hover:text-primary'

/** Account icon: «Войти» link for a guest (also before hydration); the account menu once signed in. */
interface Props {
  buttonClass: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserMenu({ buttonClass, open, onOpenChange }: Props) {
  const session = useSession()

  if (!session) {
    return (
      <Link
        href="/login"
        className={buttonVariants({ variant: 'ghost', size: 'icon', className: buttonClass })}
        aria-label="Войти"
      >
        <UserRound className="size-6.5" fill="currentColor" strokeWidth={2} aria-hidden />
      </Link>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" className={buttonClass} aria-label={`Аккаунт: ${session.name}`} />}
      >
        <UserRound className="size-6.5" fill="currentColor" strokeWidth={2} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} aria-label="Аккаунт" className="w-56 gap-0 p-3">
        <p className="m-0 truncate px-1.5 font-[650]">{session.name}</p>
        <p className="m-0 mb-1.5 truncate px-1.5 text-sm text-muted-foreground">{session.email}</p>
        <nav aria-label="Аккаунт">
          <Link className={linkClass} href="/trips" onClick={() => onOpenChange(false)}>
            Мои поездки
          </Link>
        </nav>
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            void signOut()
            onOpenChange(false)
          }}
        >
          Выйти
        </Button>
      </PopoverContent>
    </Popover>
  )
}
