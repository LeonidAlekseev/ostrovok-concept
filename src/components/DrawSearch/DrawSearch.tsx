'use client'

import dynamic from 'next/dynamic'
import { useState, type CSSProperties } from 'react'
import { ArrowRight, RotateCcw, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PALETTE } from '@/lib/drawMood'
import { RainbowButton } from './RainbowButton'

// The window and its canvas load on the first click: the home page does not pay for them up front.
const DrawSearchDialog = dynamic(() => import('./DrawSearchDialog').then((m) => m.DrawSearchDialog), { ssr: false })

/** The blue «rays» by the title, drawn for its left side; the right side mirrors them. */
function Rays({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 64"
      className={`h-[clamp(36px,7vw,64px)] w-auto shrink-0 text-primary ${className ?? ''}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={6}
    >
      <path d="M17 8 L28 22" />
      <path d="M5 46 L28 48" />
    </svg>
  )
}

export function DrawSearch() {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so the window keeps the drawing and closes with its animation.
  const [opened, setOpened] = useState(false)
  // The colour of the brush: chosen in the card or in the window, the window opens on it.
  const [colorId, setColorId] = useState(PALETTE[0].id)
  // Each replay mounts the drawing anew, which starts its reveal again.
  const [replay, setReplay] = useState(0)

  const openWindow = () => {
    setOpened(true)
    setOpen(true)
  }

  return (
    <section
      id="draw"
      aria-labelledby="draw-title"
      className="relative isolate mt-[clamp(8px,2vw,16px)] flex scroll-mt-4 flex-col items-center overflow-hidden rounded-[clamp(22px,5.6vw,30px)] px-[clamp(14px,4vw,56px)] pt-[clamp(40px,8vw,88px)] pb-[clamp(24px,4vw,48px)] text-center"
    >
      {/* The owner's watercolour bay: below the first screen, so it loads lazily; it melts into the page below. */}
      <picture aria-hidden>
        <source media="(min-width: 640px)" srcSet="/images/draw/bg.webp" />
        <img
          src="/images/draw/bg-mobile.webp"
          alt=""
          width={760}
          height={941}
          loading="lazy"
          className="absolute inset-x-0 top-0 -z-10 h-[clamp(500px,58vw,760px)] w-full object-cover object-[50%_62%] mask-b-from-55%"
        />
      </picture>

      <div className="flex items-center gap-[clamp(6px,2vw,24px)]">
        <Rays />
        <h2 id="draw-title" className="text-[clamp(30px,8.4vw,60px)]/[1.08] font-extrabold tracking-[-0.02em]">
          Нарисуй своё <br />
          путешествие
        </h2>
        <Rays className="-scale-x-100" />
      </div>
      <p className="mt-[clamp(12px,2.4vw,20px)] max-w-[36ch] text-[clamp(15px,3.9vw,21px)]/[1.45] text-foreground/65">
        По цветам поймём настроение: море и покой, город и ночь или роскошь — и подберём отель.
      </p>

      <div className="relative mt-[clamp(40px,10vw,120px)] flex w-full max-w-[880px] flex-col gap-[clamp(14px,3vw,28px)] rounded-[clamp(22px,5vw,34px)] bg-card p-[clamp(14px,3.4vw,32px)] shadow-(--shadow-card)">
        {/* A child's drawing of the sea and the sun: decoration only, the window's canvas starts empty. */}
        <img
          key={replay}
          src="/images/draw/preview.webp"
          alt=""
          aria-hidden
          width={1100}
          height={382}
          loading="lazy"
          className="mx-auto h-auto w-[90%] animate-draw-reveal pt-[clamp(28px,6vw,52px)] motion-reduce:animate-none"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Нарисовать заново"
          className="absolute top-[clamp(10px,2.4vw,24px)] right-[clamp(10px,2.4vw,24px)] bg-card text-foreground/70 shadow-(--shadow-card) hover:bg-card hover:text-foreground"
          onClick={() => setReplay((n) => n + 1)}
        >
          <RotateCcw aria-hidden />
        </Button>

        <div
          role="group"
          aria-label="Цвет кисти"
          className="flex items-center justify-between gap-1 rounded-full bg-background/80 px-[clamp(8px,2vw,18px)] py-[clamp(8px,1.8vw,16px)]"
        >
          {PALETTE.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Рисовать цветом «${c.label}»`}
              aria-haspopup="dialog"
              data-chosen={c.id === colorId || undefined}
              onClick={() => {
                setColorId(c.id)
                openWindow()
              }}
              className="size-[clamp(22px,6vw,52px)] rounded-full bg-(--swatch) ring-offset-[clamp(2px,0.5vw,4px)] ring-offset-background transition-transform hover:scale-110 data-chosen:ring-[clamp(2px,0.5vw,4px)] data-chosen:ring-(--swatch) motion-reduce:transition-none"
              style={{ '--swatch': c.hex } as CSSProperties}
            />
          ))}
        </div>
      </div>

      <RainbowButton
        className="mt-[clamp(20px,4vw,40px)] h-[clamp(56px,12vw,76px)] w-full max-w-[600px] justify-between rounded-full px-[clamp(24px,6vw,48px)] text-[clamp(19px,4.8vw,28px)]"
        aria-haspopup="dialog"
        onClick={openWindow}
      >
        <WandSparkles aria-hidden className="size-[1.15em]" />
        Нарисовать
        <ArrowRight aria-hidden className="size-[1.1em]" />
      </RainbowButton>
      {opened && <DrawSearchDialog open={open} onOpenChange={setOpen} colorId={colorId} onColorIdChange={setColorId} />}
    </section>
  )
}
