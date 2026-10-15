import { useCallback, useId, useRef, useState } from 'react'
import { Heart, Menu, User, X } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'
import styles from './Header.module.css'

type Panel = 'favorites' | 'profile' | 'menu'

interface Props {
  onStartSearch: () => void
}

const menuLinks = [
  { href: '#search', label: 'Поиск отелей' },
  { href: '#ideas', label: 'Идеи для путешествий' },
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
            <Heart size={26} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.profile}`}
            aria-label="Профиль"
            {...buttonProps('profile')}
          >
            <User size={22} fill="currentColor" strokeWidth={1.6} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={open === 'menu' ? 'Закрыть меню' : 'Открыть меню'}
            {...buttonProps('menu')}
          >
            {open === 'menu' ? <X size={30} aria-hidden /> : <Menu size={30} strokeWidth={1.8} aria-hidden />}
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
              {open === 'profile' && (
                <>
                  <p className={styles.panelTitle}>Личный кабинет</p>
                  <p className={styles.panelText}>Вход недоступен в демо-версии. Поиск работает без авторизации.</p>
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
  profile: 'Профиль',
  menu: 'Меню',
}
