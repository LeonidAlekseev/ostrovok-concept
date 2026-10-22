'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Moon, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RouteCardData } from '@/lib/routes'

// The window, the vibe and its picture load on the first click: the home page does not pay for them up front.
const VibeSearchDialog = dynamic(() => import('./VibeSearchDialog').then((m) => m.VibeSearchDialog), { ssr: false })

const halfClass =
  'flex min-h-[clamp(120px,30vw,200px)] flex-col items-center justify-center gap-2 rounded-[clamp(18px,4.6vw,26px)] p-[clamp(10px,3vw,24px)] text-center text-primary-foreground shadow-(--shadow-card)'

export function VibeSearch({ routes }: { routes: readonly RouteCardData[] }) {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so the window keeps the answers and closes with its animation.
  const [opened, setOpened] = useState(false)

  return (
    <section
      id="vibe"
      aria-labelledby="vibe-title"
      className="mt-[clamp(8px,2vw,16px)] flex scroll-mt-4 flex-col items-center gap-[clamp(12px,3vw,20px)]"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id="vibe-title" className="text-title font-bold tracking-[-0.02em]">
          Поиск вайба
        </h2>
        <p className="max-w-[52ch] text-[clamp(14px,3.7vw,17px)] text-muted-foreground">
          Семь пар противоположностей — и вы узнаете свой вайб, получите картинку для друзей, готовый маршрут и отели
          под настроение.
        </p>
      </div>

      <div className="relative grid w-full grid-cols-2 gap-[clamp(8px,2vw,16px)]">
        <div className={`${halfClass} bg-(image:--decor-vibe-calm)`}>
          <Moon className="size-[clamp(26px,7vw,44px)]" aria-hidden />
          <p className="text-[clamp(16px,4.6vw,28px)]/[1.15] font-extrabold">Тихий вечер</p>
        </div>
        <div className={`${halfClass} bg-(image:--decor-vibe-loud)`}>
          <PartyPopper className="size-[clamp(26px,7vw,44px)]" aria-hidden />
          <p className="text-[clamp(16px,4.6vw,28px)]/[1.15] font-extrabold">Шумная вечеринка</p>
        </div>
        <span className="absolute top-1/2 left-1/2 grid size-[clamp(40px,10vw,64px)] -translate-1/2 place-items-center rounded-full bg-background text-[clamp(14px,3.6vw,20px)] font-extrabold shadow-(--shadow-popover)">
          <span aria-hidden className="animate-vibe-beat motion-reduce:animate-none">
            vs
          </span>
          <span className="sr-only">против</span>
        </span>
      </div>

      <Button
        size="lg"
        shape="pill"
        className="gap-2.5 bg-[image:linear-gradient(100deg,var(--decor-vibe-calm-to),var(--decor-vibe-loud-from))] shadow-(--decor-spin-shadow) hover:scale-[1.03]"
        onClick={() => {
          setOpened(true)
          setOpen(true)
        }}
      >
        Найти свой вайб
      </Button>
      {opened && <VibeSearchDialog open={open} onOpenChange={setOpen} routes={routes} />}
    </section>
  )
}
