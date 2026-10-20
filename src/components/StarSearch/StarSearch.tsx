'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MagicOrb } from './MagicOrb'

// The window, the reading and the video load on the first click: the home page does not pay for them up front.
const StarSearchDialog = dynamic(() => import('./StarSearchDialog').then((m) => m.StarSearchDialog), { ssr: false })

// A sky of small stars behind the section.
const starrySky =
  '[background:radial-gradient(circle,color-mix(in_srgb,var(--decor-light)_70%,transparent)_0_1px,transparent_1.5px)_0_0/46px_46px,radial-gradient(circle,color-mix(in_srgb,var(--decor-gold)_60%,transparent)_0_1px,transparent_1.5px)_23px_17px/61px_61px,radial-gradient(120%_90%_at_85%_0%,color-mix(in_srgb,var(--decor-violet)_55%,transparent),transparent_60%),var(--decor-night)]'

export function StarSearch() {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so the window keeps the answers and closes with its animation.
  const [opened, setOpened] = useState(false)

  return (
    <section
      id="stars"
      aria-labelledby="stars-title"
      className={`${starrySky} mt-[clamp(8px,2vw,16px)] grid scroll-mt-4 items-center gap-[clamp(16px,4vw,40px)] overflow-hidden rounded-[clamp(22px,5.6vw,30px)] px-[clamp(18px,5vw,56px)] py-[clamp(22px,5vw,48px)] text-primary-foreground sm:grid-cols-[auto_1fr]`}
    >
      <MagicOrb symbol="✦" className="mx-auto size-[clamp(128px,32vw,200px)]" />
      <div className="flex flex-col items-start gap-3 max-sm:items-center max-sm:text-center">
        <h2 id="stars-title" className="text-title font-bold tracking-[-0.02em]">
          Поиск по звёздам
        </h2>
        <p className="max-w-[52ch] text-[clamp(14px,3.7vw,17px)] text-(--decor-light)/80">
          Знак зодиака, Луна в день заезда и аспекты подскажут город и отель. Предсказание можно отправить друзьям
          коротким видео.
        </p>
        <Button
          size="lg"
          shape="pill"
          className="mt-1 gap-2.5 bg-(image:--decor-spin-gradient) shadow-(--decor-spin-shadow) hover:scale-[1.03]"
          onClick={() => {
            setOpened(true)
            setOpen(true)
          }}
        >
          <Sparkles className="size-5.5" aria-hidden />
          Найти по звёздам
        </Button>
      </div>
      {opened && <StarSearchDialog open={open} onOpenChange={setOpen} />}
    </section>
  )
}
