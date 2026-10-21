'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Heart, Menu, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSession } from '@/hooks/useStore'
import { useStickyHeader } from '@/hooks/useStickyHeader'
import { cn } from '@/lib/utils'
import { UserMenu } from './UserMenu'

type Panel = 'notifications' | 'account' | 'menu'

// Blue on the lime hero; the white glaze replaces ghost's grey hover there.
// Below 360 px the four icons take 40 px each: the touch area shrinks a little, the glyph stays 24 px or more.
const iconButton =
  'text-primary hover:bg-card/35 hover:text-primary-hover aria-expanded:bg-card/35 aria-expanded:text-primary-hover max-[360px]:size-10'
// White over the photo of the hotel page, under a glaze of the same white.
const iconButtonOnPhoto =
  'text-white hover:bg-white/20 hover:text-white aria-expanded:bg-white/20 aria-expanded:text-white max-[360px]:size-10'

/** The hotel page, not its rates: its photo starts under the header. */
const HOTEL_PAGE = /^\/hotels\/[^/]+$/

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

// A pointer or touch press leaves focus on the button; only keyboard focus should keep the header shown.
const isKeyboardFocus = (element: Element | null) => {
  try {
    return element?.matches(':focus-visible') ?? false
  } catch {
    return false
  }
}

export function Header() {
  const [open, setOpen] = useState<Panel | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const session = useSession()

  // Only one panel is open at a time: a panel closing never closes a sibling that already opened.
  const panelProps = (panel: Panel) => ({
    open: open === panel,
    onOpenChange: (next: boolean) => setOpen((current) => (next ? panel : current === panel ? null : current)),
  })

  const wrapperRef = useRef<HTMLDivElement>(null)
  const [focusWithin, setFocusWithin] = useState(false)
  const { floating, shown, animated } = useStickyHeader(wrapperRef, open !== null || focusWithin)
  // On the home page the docked header is transparent: the hero (and the globe's glow) continues underneath.
  // On the hotel page too, its logo and icons white over the photo.
  const pathname = usePathname()
  const onPhoto = HOTEL_PAGE.test(pathname) && !floating
  const transparent = (pathname === '/' && !floating) || onPhoto
  const buttonClass = onPhoto ? iconButtonOnPhoto : iconButton
  // On /search the header follows the results page width on 3xl screens, and its logo and icons align with the search card.
  const wideSearch = pathname === '/search'

  // The wrapper keeps the header's place in the flow, so the content does not jump when the header turns fixed.
  return (
    <div ref={wrapperRef} className="relative z-20 h-(--header-height)">
      <header
        data-sticky={floating ? (shown ? 'shown' : 'hidden') : 'docked'}
        onFocus={() => setFocusWithin(isKeyboardFocus(document.activeElement))}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false)
        }}
        className={cn(
          'inset-x-0 top-0',
          floating ? 'fixed' : 'absolute',
          animated && 'transition-transform duration-200 ease-out motion-reduce:transition-none',
          floating && !shown && '-translate-y-full',
          floating && shown && 'translate-y-0 shadow-md',
          !transparent && 'rounded-b-[clamp(20px,5vw,32px)] bg-chrome',
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
              'rounded-sm text-[clamp(26px,6.6vw,32px)] leading-none font-extrabold tracking-[-0.035em] no-underline',
              onPhoto ? 'text-white' : 'text-primary',
            )}
            href="/"
            onClick={close}
            aria-label="Островок! — на главную"
          >
            Островок!
          </a>

          <div className="relative flex items-center gap-[clamp(0px,1vw,14px)] max-[360px]:gap-0">
            <Link
              href="/favorites"
              className={buttonVariants({ variant: 'ghost', size: 'icon', className: buttonClass })}
              aria-label="Избранное"
            >
              <Heart className="size-6.5" fill="currentColor" strokeWidth={2} aria-hidden />
            </Link>

            <Popover {...panelProps('notifications')}>
              <PopoverTrigger
                render={<Button variant="ghost" size="icon" className={buttonClass} aria-label="Уведомления" />}
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

            <UserMenu buttonClass={buttonClass} {...panelProps('account')} />

            <Popover {...panelProps('menu')}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className={buttonClass}
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
