import { useImperativeHandle, useState, useSyncExternalStore, type Ref } from 'react'
import { createPortal } from 'react-dom'

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
      className="fixed right-2 bottom-2 z-2147483647 max-w-[calc(100vw-16px)] rounded-sm bg-(--decor-black)/78 px-2 py-1 font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-[11px]/[1.4] text-(--decor-stats)"
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        localStorage.setItem(OPEN_KEY, e.currentTarget.open ? '1' : '0')
      }}
      aria-hidden
    >
      <summary className="cursor-pointer select-none">{text.summary}</summary>
      {text.details && (
        <pre className="mt-1 mb-0.5 overflow-hidden [font:inherit] text-ellipsis whitespace-pre">{text.details}</pre>
      )}
    </details>,
    document.body,
  )
}
