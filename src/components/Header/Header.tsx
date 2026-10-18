import { useCallback, useId, useRef, useState } from 'react'
import { Bell, Heart, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDismiss } from '@/hooks/useDismiss'
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
  const actionsRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const close = useCallback(() => setOpen(null), [])
  useDismiss(actionsRef, open !== null, close)

  const toggle = (panel: Panel) => setOpen((current) => (current === panel ? null : panel))
  const buttonProps = (panel: Panel) => ({
    'aria-expanded': open === panel,
    'aria-controls': open === panel ? panelId : undefined,
    onClick: () => toggle(panel),
  })

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a className={styles.logo} href="/" aria-label="Островок! — на главную">
          Островок!
        </a>

        <div className={styles.actions} ref={actionsRef}>
          <Button variant="ghost" size="icon" className={iconButton} aria-label="Избранное" {...buttonProps('favorites')}>
            <Heart className="size-6.5" fill="currentColor" strokeWidth={2} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            aria-label="Уведомления"
            {...buttonProps('notifications')}
          >
            <Bell className="size-6.25" fill="currentColor" strokeWidth={2} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            aria-label={open === 'menu' ? 'Закрыть меню' : 'Открыть меню'}
            {...buttonProps('menu')}
          >
            {open === 'menu' ? (
              <X className="size-7" strokeWidth={2.8} aria-hidden />
            ) : (
              <Menu className="size-7" strokeWidth={2.8} aria-hidden />
            )}
          </Button>

          {open && (
            <Card
              className={`${styles.panel} gap-0 p-4.5 shadow-(--shadow-popover)`}
              id={panelId}
              role="dialog"
              aria-label={panelTitle[open]}
            >
              {open === 'favorites' && (
                <>
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
                </>
              )}
              {open === 'notifications' && (
                <>
                  <p className={styles.panelTitle}>Новых уведомлений нет</p>
                  <p className={styles.panelText}>Здесь появятся изменения цен и статусы бронирований.</p>
                  <Button className="w-full" onClick={close}>
                    Понятно
                  </Button>
                </>
              )}
              {open === 'menu' && (
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
              )}
            </Card>
          )}
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
