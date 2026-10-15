import { useImperativeHandle, useState, useSyncExternalStore, type Ref } from 'react'
import { createPortal } from 'react-dom'
import styles from './Hero.module.css'

export interface StatsPanelHandle {
  show(summary: string, details: string): void
}

const OPEN_KEY = 'globe-stats-open'
const subscribeNever = () => () => {}

/** Collapsible technical overlay, mounted on <body> so no stacking context of the page can cover it. */
export function StatsPanel({ ref }: { ref: Ref<StatsPanelHandle> }) {
  // False while hydrating: the server has no <body> to portal into.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  const [open, setOpen] = useState(() => typeof localStorage === 'undefined' || localStorage.getItem(OPEN_KEY) !== '0')
  const [text, setText] = useState({ summary: 'stats', details: '' })

  useImperativeHandle(ref, () => ({ show: (summary, details) => setText({ summary, details }) }), [])

  if (!mounted) return null
  return createPortal(
    <details
      className={styles.stats}
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        localStorage.setItem(OPEN_KEY, e.currentTarget.open ? '1' : '0')
      }}
      aria-hidden
    >
      <summary>{text.summary}</summary>
      {text.details && <pre>{text.details}</pre>}
    </details>,
    document.body,
  )
}
