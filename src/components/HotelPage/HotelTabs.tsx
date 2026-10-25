'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { isRated, type Hotel } from '@/lib/catalog'
import { goToSection } from './goToSection'
import { formatCount } from './reviewsLabel'

/** The sections of the page in their order, as the tabs name them. */
const hotelSections = (hotel: Hotel) => [
  { id: 'overview', label: 'Обзор' },
  { id: 'rooms', label: 'Номера' },
  { id: 'amenities', label: 'Удобства' },
  // An unrated hotel has no rating section.
  ...(isRated(hotel) ? [{ id: 'rating', label: `Отзывы (${formatCount(hotel.reviewCount)})` }] : []),
  { id: 'location', label: 'Расположение' },
  { id: 'rules', label: 'Правила' },
]

/** A section is current once its top passes this far below the tabs, px. */
const SLACK = 12

/**
 * The tabs under the photos: anchors to the sections, stuck to the top of the page (on a phone under the compact
 * header) or of the hotel dialog. The current one is underlined: the one clicked, then, as the page scrolls,
 * the last section whose top has passed under the tabs.
 */
export function HotelTabs({ hotel, className }: { hotel: Hotel; className?: string }) {
  const sections = hotelSections(hotel)
  const ids = sections.map((s) => s.id).join(' ')
  const [active, setActive] = useState(sections[0].id)
  const nav = useRef<HTMLElement>(null)
  // A clicked tab stays current until the user scrolls: a short last section never reaches the tabs.
  const pinned = useRef(false)

  useEffect(() => {
    const update = () => {
      if (pinned.current || !nav.current) return
      const line = nav.current.getBoundingClientRect().bottom + SLACK
      let current = ids.split(' ')[0]
      for (const id of ids.split(' ')) {
        const section = document.getElementById(id)
        if (section && section.getBoundingClientRect().top <= line) current = id
      }
      setActive(current)
    }
    const unpin = () => {
      pinned.current = false
    }
    update()
    // Captured: the hotel dialog scrolls its own box, not the window.
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    for (const type of ['wheel', 'touchstart', 'keydown'] as const)
      window.addEventListener(type, unpin, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
      for (const type of ['wheel', 'touchstart', 'keydown'] as const)
        window.removeEventListener(type, unpin, { capture: true })
    }
  }, [ids])

  // On a phone the tabs scroll sideways: keep the current one in sight.
  useEffect(() => {
    const row = nav.current?.querySelector('ul')
    const tab = row?.querySelector<HTMLElement>('[aria-current]')
    if (!row || !tab) return
    const left = tab.offsetLeft - row.offsetLeft
    if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollLeft = left - (row.clientWidth - tab.offsetWidth) / 2
  }, [active])

  return (
    <nav
      ref={nav}
      aria-label="Разделы отеля"
      className={cn('sticky top-0 z-20 border-b border-border bg-(--decor-surface-soft)', className)}
    >
      <ul className="-mb-px flex gap-[clamp(16px,3vw,32px)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map(({ id, label }) => (
          <li key={id} className="shrink-0">
            <button
              type="button"
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'border-b-2 py-3 text-base whitespace-nowrap transition-colors',
                active === id
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                // Set before the scroll, so the scroll it causes does not move the underline.
                pinned.current = true
                setActive(id)
                goToSection(id)
              }}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
