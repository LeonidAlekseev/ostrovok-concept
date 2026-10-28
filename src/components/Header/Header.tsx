'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSession } from '@/hooks/useStore'
import { isHotelier } from '@/lib/hotelierChatRemote'
import { signOut } from '@/lib/session'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from 'cn'

// The header's look follows the page content, not the pathname: `usePathname()` is not reliable in the server
// HTML of a prerendered page, and React does not fix attributes at hydration. The body is `group/page`; the home
// hero has `#hero-title`. The logo and the menu are blue on every page; the white glaze replaces ghost's grey hover.
const iconButton =
  'text-primary hover:bg-card/35 hover:text-primary-hover aria-expanded:bg-card/35 aria-expanded:text-primary-hover'

// Placement comes from the popover (portaled, aligned to its trigger); only the size and the entrance are here.
const panelClass =
  'w-[min(300px,calc(100vw-2*var(--page-x)))] gap-0 p-4.5 shadow-(--shadow-popover) animate-in fade-in slide-in-from-top-1 animation-duration-180 ease-out'

const menuItemClass =
  'block w-full rounded-md p-3 text-left font-[550] text-foreground no-underline hover:bg-muted hover:text-primary'

const links = [
  { href: '/assistant', label: 'Мои чаты' },
  { href: '/search', label: 'Искать вручную' },
  { href: '/trips', label: 'Мои поездки' },
  { href: '/favorites', label: 'Избранное' },
]

/** «Панель отельера» for a hotelier's account: asked of the database when the menu opens. */
function HotelierLink({ email, onClick }: { email: string; onClick: () => void }) {
  const [hotelier, setHotelier] = useState<{ email: string; is: boolean } | null>(null)
  useEffect(() => {
    const client = getBrowserClient()
    if (!client) return
    let current = true
    isHotelier(client)
      .then((is) => current && setHotelier({ email, is }))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [email])
  if (!hotelier?.is || hotelier.email !== email) return null
  return (
    <Link className={cn(menuItemClass, 'mb-2')} href="/hotelier" onClick={onClick}>
      Панель отельера
    </Link>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const session = useSession()

  // On /search the header follows the results page width on 3xl screens, and its logo and icons align with the search card.
  const wideSearch = usePathname() === '/search'

  // The wrapper keeps the header's place in the flow; the header scrolls away with the page.
  return (
    <div className="relative z-20 h-(--header-height)">
      <header className={cn('absolute inset-x-0 top-0 bg-background', 'group-has-[#hero-title]/page:bg-transparent')}>
        <div
          className={cn(
            'mx-auto flex h-(--header-height) max-w-(--page-max) items-center justify-between gap-4 px-[calc(var(--page-x)+8px)]',
            wideSearch && '3xl:max-w-(--page-max-wide) 3xl:px-(--page-x)',
          )}
        >
          <a
            className="rounded-sm text-[clamp(26px,6.6vw,32px)] leading-none font-extrabold tracking-[-0.035em] whitespace-nowrap text-primary no-underline"
            href="/"
            onClick={close}
            aria-label="О!бъективно — на главную"
          >
            О!бъективно
          </a>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
                />
              }
            >
              {open ? (
                <X className="size-7" strokeWidth={2.8} aria-hidden />
              ) : (
                <Menu className="size-7" strokeWidth={2.8} aria-hidden />
              )}
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={10} aria-label="Меню" className={panelClass}>
              <nav aria-label="Основное меню">
                <ul className="-m-1.5">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link className={menuItemClass} href={link.href} onClick={close}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link className={menuItemClass} href="/api/docs" onClick={close}>
                      API Docs
                    </Link>
                  </li>
                  {!session && (
                    <li>
                      <Link className={menuItemClass} href="/login" onClick={close}>
                        Войти
                      </Link>
                    </li>
                  )}
                </ul>
              </nav>
              {session && (
                <section aria-label="Аккаунт" className="-mx-1.5 mt-3 border-t px-1.5 pt-3">
                  <p className="m-0 truncate px-1.5 font-[650]">{session.name}</p>
                  <p className="m-0 mb-2 truncate px-1.5 text-sm text-muted-foreground">{session.email}</p>
                  <HotelierLink email={session.email} onClick={close} />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      void signOut()
                      close()
                    }}
                  >
                    Выйти
                  </Button>
                </section>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </header>
    </div>
  )
}
