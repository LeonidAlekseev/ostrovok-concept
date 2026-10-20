'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSession } from '@/hooks/useStore'
import { signOut } from '@/lib/auth'

const linkClass = 'block rounded-md p-3 font-[550] text-foreground no-underline hover:bg-muted hover:text-primary'

/** «Войти» for a guest (also before hydration); the name with the account menu once signed in. */
export function UserMenu({ buttonClass }: { buttonClass: string }) {
  const session = useSession()
  const [open, setOpen] = useState(false)

  if (!session) {
    return (
      <Link href="/login" className={buttonVariants({ variant: 'ghost', className: buttonClass })}>
        Войти
      </Link>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" className={buttonClass} />}>
        <span className="max-w-[10ch] truncate">{session.name}</span>
        <ChevronDown aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} aria-label="Аккаунт" className="w-56 gap-0 p-3">
        <p className="m-0 mb-1.5 truncate px-1.5 text-sm text-muted-foreground">{session.email}</p>
        <nav aria-label="Аккаунт">
          <Link className={linkClass} href="/trips" onClick={() => setOpen(false)}>
            Мои поездки
          </Link>
        </nav>
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            signOut()
            setOpen(false)
          }}
        >
          Выйти
        </Button>
      </PopoverContent>
    </Popover>
  )
}
