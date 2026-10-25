'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MagicOrb } from './MagicOrb'
import { ZodiacRing } from './ZodiacRing'

// The window, the reading and the video load on the first click: the home page does not pay for them up front.
const StarSearchDialog = dynamic(() => import('./StarSearchDialog').then((m) => m.StarSearchDialog), { ssr: false })

export function StarSearch() {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so the window keeps the answers and closes with its animation.
  const [opened, setOpened] = useState(false)

  return (
    <section
      id="stars"
      aria-labelledby="stars-title"
      className="relative isolate mt-[clamp(8px,2vw,16px)] flex scroll-mt-4 flex-col items-center gap-[clamp(14px,3vw,24px)] overflow-hidden rounded-[clamp(22px,5.6vw,30px)] bg-(--decor-night) px-[clamp(18px,5vw,56px)] py-[clamp(24px,5vw,48px)] text-center text-primary-foreground"
    >
      {/* The sky of the owner: below the first screen, so it loads lazily. */}
      <picture aria-hidden>
        <source media="(min-width: 640px)" srcSet="/images/stars/sky.webp" />
        <img
          src="/images/stars/sky-mobile.webp"
          alt=""
          width={800}
          height={656}
          loading="lazy"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      </picture>
      <div className="relative size-[clamp(260px,64vw,400px)]">
        <MagicOrb className="absolute inset-[22.5%]" />
        <ZodiacRing className="absolute inset-0 size-full" />
      </div>
      <h2
        id="stars-title"
        className="bg-(image:--decor-gold-gradient) bg-clip-text text-[clamp(30px,8.4vw,56px)]/[1.1] font-bold tracking-[-0.02em] text-transparent"
      >
        Звёзды подскажут
      </h2>
      <p className="max-w-[40ch] text-[clamp(15px,3.9vw,20px)] text-(--decor-light)">
        Знак зодиака, <span className="text-(--decor-lavender)">Луна в день заезда</span> и аспекты{' '}
        <span className="text-(--decor-lavender)">подскажут город и отель</span>. Предсказание можно отправить друзьям
        коротким видео.
      </p>
      <Button
        size="lg"
        shape="pill"
        className="mt-1 gap-2.5 border border-(--decor-gold) bg-(image:--decor-star-button) px-10 shadow-(--decor-spin-shadow) hover:scale-[1.03] hover:bg-(image:--decor-star-button)"
        onClick={() => {
          setOpened(true)
          setOpen(true)
        }}
      >
        <Sparkles className="size-5.5" aria-hidden />
        Найти по звёздам
      </Button>
      {opened && <StarSearchDialog open={open} onOpenChange={setOpen} />}
    </section>
  )
}
