import { useCallback, useState } from 'react'
import { Bell, Heart, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import styles from './Header.module.css'

type Panel = 'favorites' | 'notifications' | 'menu'

interface Props {
  onStartSearch: () => void
}

// Blue on the lime hero; the white glaze replaces ghost's grey hover there.
const iconButton =
  'text-primary hover:bg-card/35 hover:text-primary-hover aria-expanded:bg-card/35 aria-expanded:text-primary-hover'

const menuLinks = [
  { href: '#search', label: 'Поиск отелей' },
  { href: '#ideas', label: 'Популярные направления' },
  { href: '#explore', label: 'Исследуйте мир' },
]

export function Header({ onStartSearch }: Props) {
  const [open, setOpen] = useState<Panel | null>(null)
  const close = useCallback(() => setOpen(null), [])

  // Only one panel is open at a time: a panel closing never closes a sibling that already opened.
  const panelProps = (panel: Panel) => ({
    open: open === panel,
    onOpenChange: (next: boolean) => setOpen((current) => (next ? panel : current === panel ? null : current)),
  })

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a className={styles.logo} href="/" aria-label="Островок! — на главную">
          Островок!
        </a>

        <div className={styles.actions}>
          <Popover {...panelProps('favorites')}>
            <PopoverTrigger
              render={<Button variant="ghost" size="icon" className={iconButton} aria-label="Избранное" />}
            >
              <Heart className="size-6.5" fill="currentColor" strokeWidth={2} aria-hidden />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              aria-label={panelTitle.favorites}
              className={`${styles.panel} gap-0 p-4.5 shadow-(--shadow-popover)`}
            >
              <p className={styles.panelTitle}>Избранное пока пусто</p>
              <p className={styles.panelText}>Сохраняйте понравившиеся отели, чтобы вернуться к ним позже.</p>
              <Button
                className="w-full"
                onClick={() => {
                  close()
                  onStartSearch()
                }}
              >
                Найти отель
              </Button>
            </PopoverContent>
          </Popover>

          <Popover {...panelProps('notifications')}>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon" className={iconButton} aria-label="Уведомления" />
              }
            >
              <Bell className="size-6.25" fill="currentColor" strokeWidth={2} aria-hidden />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              aria-label={panelTitle.notifications}
              className={`${styles.panel} gap-0 p-4.5 shadow-(--shadow-popover)`}
            >
              <p className={styles.panelTitle}>Новых уведомлений нет</p>
              <p className={styles.panelText}>Здесь появятся изменения цен и статусы бронирований.</p>
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
            <PopoverContent
              align="end"
              sideOffset={10}
              aria-label={panelTitle.menu}
              className={`${styles.panel} gap-0 p-4.5 shadow-(--shadow-popover)`}
            >
              <nav aria-label="Основное меню">
                <ul className={styles.menuList}>
                  {menuLinks.map((link) => (
                    <li key={link.href}>
                      <a className={styles.menuLink} href={link.href} onClick={close}>
                        {link.label}
                      </a>
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
  favorites: 'Избранное',
  notifications: 'Уведомления',
  menu: 'Меню',
}
