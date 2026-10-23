'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Heart, Menu, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSession } from '@/hooks/useStore'
import { cn } from '@/lib/utils'
import { UserMenu } from './UserMenu'

type Panel = 'notifications' | 'account' | 'menu'

// The header's look follows the page content, not the pathname: `usePathname()` is not reliable in the server
// HTML of a prerendered page, and React does not fix attributes at hydration. The body is `group/page`; the home
// hero has `#hero-title`, the hotel page's `main` has `data-header-photo` (its photo starts under the header).
// Blue on the lime hero, where the white glaze replaces ghost's grey hover; white over the photo of the hotel
// page, under a glaze of the same white.
// Below 360 px the four icons take 40 px each: the touch area shrinks a little, the glyph stays 24 px or more.
const iconButton = cn(
  'text-primary hover:bg-card/35 hover:text-primary-hover aria-expanded:bg-card/35 aria-expanded:text-primary-hover max-[360px]:size-10',
  'group-has-[[data-header-photo]]/page:text-white group-has-[[data-header-photo]]/page:hover:bg-white/20 group-has-[[data-header-photo]]/page:hover:text-white group-has-[[data-header-photo]]/page:aria-expanded:bg-white/20 group-has-[[data-header-photo]]/page:aria-expanded:text-white',
)

// Placement comes from the popover (portaled, aligned to its trigger); only the size and the entrance are here.
const panelClass =
  'w-[min(300px,calc(100vw-2*var(--page-x)))] gap-0 p-4.5 shadow-(--shadow-popover) animate-in fade-in slide-in-from-top-1 animation-duration-180 ease-out'

const panelTitleClass = 'm-0 mb-1.5 text-base font-[650]'
const panelTextClass = 'm-0 mb-3.5 text-sm leading-[1.45] text-muted-foreground'

const menuItemClass =
  'block w-full rounded-md p-3 text-left font-[550] text-foreground no-underline hover:bg-muted hover:text-primary'

const linksBefore = [
  { href: '/#search', label: 'Поиск отелей' },
  { href: '/trips', label: 'Мои поездки' },
  { href: '/favorites', label: 'Избранное' },
]

export function Header() {
  const [open, setOpen] = useState<Panel | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const session = useSession()

  // Only one panel is open at a time: a panel closing never closes a sibling that already opened.
  const panelProps = (panel: Panel) => ({
    open: open === panel,
    onOpenChange: (next: boolean) => setOpen((current) => (next ? panel : current === panel ? null : current)),
  })

  // On /search the header follows the results page width on 3xl screens, and its logo and icons align with the search card.
  const wideSearch = usePathname() === '/search'

  // The wrapper keeps the header's place in the flow; the header scrolls away with the page.
  return (
    <div className="relative z-20 h-(--header-height)">
      <header
        className={cn(
          'absolute inset-x-0 top-0 bg-background',
          'group-has-[#hero-title]/page:bg-transparent',
          'group-has-[[data-header-photo]]/page:bg-transparent',
        )}
      >
        <div
          className={cn(
            'mx-auto flex h-(--header-height) max-w-(--page-max) items-center justify-between gap-4 px-[calc(var(--page-x)+8px)] max-[360px]:gap-2 max-[360px]:px-3',
            wideSearch && '3xl:max-w-(--page-max-wide) 3xl:px-(--page-x)',
          )}
        >
          <a
            className={cn(
              'rounded-sm text-[clamp(26px,6.6vw,32px)] leading-none font-extrabold tracking-[-0.035em] whitespace-nowrap no-underline',
              'text-primary group-has-[[data-header-photo]]/page:text-white',
            )}
            href="/"
            onClick={close}
            aria-label="О!бъективно — на главную"
          >
            О!бъективно
          </a>

          <div className="relative flex items-center gap-[clamp(0px,1vw,14px)] max-[360px]:gap-0">
            <Link
              href="/favorites"
              className={buttonVariants({ variant: 'ghost', size: 'icon', className: iconButton })}
              aria-label="Избранное"
            >
              <Heart className="size-6.5" fill="currentColor" strokeWidth={2} aria-hidden />
            </Link>

            <Popover {...panelProps('notifications')}>
              <PopoverTrigger
                render={<Button variant="ghost" size="icon" className={iconButton} aria-label="Уведомления" />}
              >
                <Bell className="size-6.25" fill="currentColor" strokeWidth={2} aria-hidden />
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={10} aria-label={panelTitle.notifications} className={panelClass}>
                <p className={panelTitleClass}>Новых уведомлений нет</p>
                <p className={panelTextClass}>Здесь появятся изменения цен и статусы бронирований.</p>
                <Button className="w-full" onClick={close}>
                  Понятно
                </Button>
              </PopoverContent>
            </Popover>

            <UserMenu buttonClass={iconButton} {...panelProps('account')} />

            <Popover {...panelProps('menu')}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className={iconButton}
                    aria-label={open === 'menu' ? 'Закрыть меню' : 'Открыть меню'}
                  />
                }
              >
                {open === 'menu' ? (
                  <X className="size-7" strokeWidth={2.8} aria-hidden />
                ) : (
                  <Menu className="size-7" strokeWidth={2.8} aria-hidden />
                )}
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={10} aria-label={panelTitle.menu} className={panelClass}>
                <nav aria-label="Основное меню">
                  <ul className="-m-1.5">
                    {linksBefore.map((link) => (
                      <li key={link.href}>
                        <Link className={menuItemClass} href={link.href} onClick={close}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <button type="button" className={menuItemClass} onClick={() => setOpen('notifications')}>
                        Уведомления
                      </button>
                    </li>
                    <li>
                      {session ? (
                        <button type="button" className={menuItemClass} onClick={() => setOpen('account')}>
                          Аккаунт
                        </button>
                      ) : (
                        <Link className={menuItemClass} href="/login" onClick={close}>
                          Войти
                        </Link>
                      )}
                    </li>
                    <li>
                      <Link className={menuItemClass} href="/help" onClick={close}>
                        Поддержка
                      </Link>
                    </li>
                  </ul>
                </nav>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>
    </div>
  )
}

const panelTitle: Record<Panel, string> = {
  notifications: 'Уведомления',
  account: 'Аккаунт',
  menu: 'Меню',
}
