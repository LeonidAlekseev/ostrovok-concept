'use client'

import dynamic from 'next/dynamic'
import { useState, type CSSProperties } from 'react'
import { Brush } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PALETTE } from '@/lib/drawMood'
import type { RouteCardData } from '@/lib/routes'

// The window and its canvas load on the first click: the home page does not pay for them up front.
const DrawSearchDialog = dynamic(() => import('./DrawSearchDialog').then((m) => m.DrawSearchDialog), { ssr: false })

/** The strokes of the decoration, in the order of the palette's colours. */
const DECOR_STROKES = [
  'M30 150 C 90 60, 150 60, 200 120 S 300 190, 360 110',
  'M60 60 C 120 30, 170 40, 230 70',
  'M250 50 C 300 20, 360 30, 410 80 S 500 130, 560 60',
  'M420 170 C 470 120, 520 140, 570 170',
  'M120 190 C 180 170, 240 175, 290 195',
]

const gradient = `linear-gradient(100deg, ${PALETTE.filter((_, i) => i % 2 === 0)
  .map((c) => c.hex)
  .join(', ')})`

export function DrawSearch({ routes }: { routes: readonly RouteCardData[] }) {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so the window keeps the drawing and closes with its animation.
  const [opened, setOpened] = useState(false)

  return (
    <section
      id="draw"
      aria-labelledby="draw-title"
      className="mt-[clamp(8px,2vw,16px)] flex scroll-mt-4 flex-col items-center gap-[clamp(12px,3vw,20px)]"
      style={{ '--draw-gradient': gradient } as CSSProperties}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id="draw-title" className="text-title font-bold tracking-[-0.02em]">
          Нарисуй своё путешествие
        </h2>
        <p className="max-w-[52ch] text-[clamp(14px,3.7vw,17px)] text-muted-foreground">
          По цветам поймём настроение: море и покой, город и ночь или роскошь — и подберём отели и готовый маршрут.
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-[clamp(10px,2.4vw,16px)] rounded-[clamp(18px,4.6vw,26px)] bg-card p-[clamp(12px,3vw,24px)] shadow-(--shadow-card)">
        <svg
          aria-hidden
          viewBox="0 0 600 220"
          className="h-auto w-full max-w-3xl"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {DECOR_STROKES.map((d, i) => (
            <path key={d} d={d} stroke={PALETTE[i * 2].hex} strokeWidth={i === 0 ? 22 : 16} />
          ))}
        </svg>
        <ul aria-hidden className="flex flex-wrap justify-center gap-[clamp(6px,1.6vw,12px)]">
          {PALETTE.map((c) => (
            <li
              key={c.id}
              className="size-[clamp(18px,4.6vw,28px)] rounded-full bg-(--swatch) shadow-(--shadow-card)"
              style={{ '--swatch': c.hex } as CSSProperties}
            />
          ))}
        </ul>
      </div>

      <Button
        size="lg"
        shape="pill"
        className="gap-2.5 bg-(image:--draw-gradient) shadow-(--decor-spin-shadow) hover:scale-[1.03] hover:bg-(image:--draw-gradient)"
        onClick={() => {
          setOpened(true)
          setOpen(true)
        }}
      >
        <Brush className="size-5" aria-hidden />
        Нарисовать
      </Button>
      {opened && <DrawSearchDialog open={open} onOpenChange={setOpen} routes={routes} />}
    </section>
  )
}
