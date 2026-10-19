'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Bell, Heart, Menu, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Panel = 'notifications' | 'menu'

// Blue on the lime hero; the white glaze replaces ghost's grey hover there.
const iconButton =
  'text-primary hover:bg-card/35 hover:text-primary-hover aria-expanded:bg-card/35 aria-expanded:text-primary-hover'

// Placement comes from the popover (portaled, aligned to its trigger); only the size and the entrance are here.
const panelClass =
  'w-[min(300px,calc(100vw-2*var(--page-x)))] gap-0 p-4.5 shadow-(--shadow-popover) animate-in fade-in slide-in-from-top-1 animation-duration-180 ease-out'

const panelTitleClass = 'm-0 mb-1.5 text-base font-[650]'
const panelTextClass = 'm-0 mb-3.5 text-sm leading-[1.45] text-muted-foreground'

const menuLinks = [
  { href: '/#search', label: 'Поиск отелей' },
  { href: '/trips', label: 'Мои поездки' },
  { href: '/favorites', label: 'Избранное' },
  { href: '/help', label: 'Поддержка' },
]

export function Header() {
  const [open, setOpen] = useState<Panel | null>(null)
  const close = useCallback(() => setOpen(null), [])

  // Only one panel is open at a time: a panel closing never closes a sibling that already opened.
  const panelProps = (panel: Panel) => ({
    open: open === panel,
    onOpenChange: (next: boolean) => setOpen((current) => (next ? panel : current === panel ? null : current)),
  })

  // Transparent: the hero (and the globe's glow) continues underneath.
  return (
    <header className="relative z-20">
      <div className="mx-auto flex h-(--header-height) max-w-(--page-max) items-center justify-between gap-4 px-[calc(var(--page-x)+8px)]">
        <a
          className="rounded-sm text-[clamp(26px,6.6vw,32px)] leading-none font-extrabold tracking-[-0.035em] text-primary no-underline"
          href="/"
          aria-label="Островок! — на главную"
        >
          Островок!
        </a>

        <div className="relative flex items-center gap-[clamp(0px,1vw,14px)]">
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
                  {menuLinks.map((link) => (
                    <li key={link.href}>
                      <Link
                        className="block rounded-md p-3 font-[550] text-foreground no-underline hover:bg-muted hover:text-primary"
                        href={link.href}
                        onClick={close}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  )
}

const panelTitle: Record<Panel, string> = {
  notifications: 'Уведомления',
  menu: 'Меню',
}
