import { useCallback, useId, useRef, useState } from 'react'
import { Bell, Heart, Menu, X } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'
import styles from './Header.module.css'

type Panel = 'favorites' | 'notifications' | 'menu'

interface Props {
  onStartSearch: () => void
}

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
          <button type="button" className={styles.iconButton} aria-label="Избранное" {...buttonProps('favorites')}>
            <Heart size={26} fill="currentColor" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" className={styles.iconButton} aria-label="Уведомления" {...buttonProps('notifications')}>
            <Bell size={25} fill="currentColor" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={open === 'menu' ? 'Закрыть меню' : 'Открыть меню'}
            {...buttonProps('menu')}
          >
            {open === 'menu' ? (
              <X size={28} strokeWidth={2.8} aria-hidden />
            ) : (
              <Menu size={28} strokeWidth={2.8} aria-hidden />
            )}
          </button>

          {open && (
            <div className={styles.panel} id={panelId} role="dialog" aria-label={panelTitle[open]}>
              {open === 'favorites' && (
                <>
                  <p className={styles.panelTitle}>Избранное пока пусто</p>
                  <p className={styles.panelText}>Сохраняйте понравившиеся отели, чтобы вернуться к ним позже.</p>
                  <button
                    type="button"
                    className={styles.panelAction}
                    onClick={() => {
                      close()
                      onStartSearch()
                    }}
                  >
                    Найти отель
                  </button>
                </>
              )}
              {open === 'notifications' && (
                <>
                  <p className={styles.panelTitle}>Новых уведомлений нет</p>
                  <p className={styles.panelText}>Здесь появятся изменения цен и статусы бронирований.</p>
                  <button type="button" className={styles.panelAction} onClick={close}>
                    Понятно
                  </button>
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
            </div>
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
