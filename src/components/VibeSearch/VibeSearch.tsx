'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import Image from 'next/image'
import { ArrowRight, Moon, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VIBE_AXES } from '@/lib/vibe'

// The window, the vibe and its picture load on the first click: the home page does not pay for them up front.
const VibeSearchDialog = dynamic(() => import('./VibeSearchDialog').then((m) => m.VibeSearchDialog), { ssr: false })

interface Side {
  title: string
  image: string
  Icon: typeof Moon
  tags: readonly string[]
  /** The mirrored tilt towards the centre and the glow of the frame. */
  className: string
  /** The shade the photo fades into under the title and the tags. */
  tint: string
  /** The crop that keeps the face in view below the tags. */
  objectPosition: string
  plate: string
}

const sides: readonly Side[] = [
  {
    title: VIBE_AXES[0].left,
    image: '/images/vibe/card-calm.webp',
    Icon: Moon,
    tags: ['уют', 'спокойствие', 'красивые места'],
    className:
      'origin-right [transform:perspective(1400px)_rotateY(5deg)] shadow-(--decor-vibe-calm-glow) ring-(--decor-vibe-calm-from)/70',
    tint: 'bg-[color-mix(in_srgb,var(--decor-vibe-calm-from)_40%,var(--decor-night))]',
    objectPosition: '30% bottom',
    plate: 'bg-[image:linear-gradient(135deg,var(--decor-vibe-calm-from),var(--decor-vibe-calm-to))]',
  },
  {
    title: VIBE_AXES[0].right,
    image: '/images/vibe/card-loud.webp',
    Icon: PartyPopper,
    tags: ['движ', 'новые знакомства', 'топовые места'],
    className:
      'origin-left [transform:perspective(1400px)_rotateY(-5deg)] shadow-(--decor-vibe-loud-glow) ring-(--decor-vibe-loud-from)/70',
    tint: 'bg-[color-mix(in_srgb,var(--decor-vibe-loud-from)_40%,var(--decor-night))]',
    objectPosition: '60% bottom',
    plate: 'bg-[image:linear-gradient(135deg,var(--decor-vibe-loud-from),var(--decor-vibe-loud-to))]',
  },
]

const strokeClass = 'absolute h-[3px] w-[clamp(12px,3.4vw,24px)] rounded-full'

export function VibeSearch() {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so the window keeps the answers and closes with its animation.
  const [opened, setOpened] = useState(false)

  return (
    <section
      id="vibe"
      aria-labelledby="vibe-title"
      className="mx-auto mt-[clamp(8px,2vw,16px)] flex w-full max-w-[880px] scroll-mt-4 flex-col items-center gap-[clamp(12px,3vw,24px)]"
    >
      <div className="flex flex-col items-center gap-[clamp(6px,1.6vw,12px)] text-center">
        <h2 id="vibe-title" className="relative text-[clamp(30px,9vw,64px)]/[1.05] font-extrabold tracking-[-0.03em]">
          <span aria-hidden className="pointer-events-none absolute -top-[10%] -left-[0.5em] hidden min-[420px]:block">
            <span className={`${strokeClass} top-0 left-0 rotate-[28deg] bg-(--decor-violet)`} />
            <span className={`${strokeClass} top-3 left-[-6px] -rotate-[10deg] bg-(--decor-violet)`} />
          </span>
          Это твой <span className="bg-(image:--decor-vibe-title) bg-clip-text text-transparent">вайб</span>
          <span aria-hidden className="pointer-events-none absolute -top-[10%] -right-[0.5em] hidden min-[420px]:block">
            <span className={`${strokeClass} top-0 right-0 -rotate-[28deg] bg-(--decor-vibe-loud-from)`} />
            <span className={`${strokeClass} top-3 right-[-6px] rotate-[10deg] bg-(--decor-vibe-loud-from)`} />
          </span>
        </h2>
        <p className="max-w-[44ch] text-[clamp(13px,3.6vw,20px)] text-muted-foreground">
          Семь пар противоположностей — и вы узнаете свой вайб, получите картинку для друзей, готовую подборку отелей и
          отели под настроение.
        </p>
      </div>

      <div className="relative w-full pb-[clamp(20px,5vw,34px)]">
        <div className="relative grid grid-cols-2 gap-[clamp(10px,3vw,28px)]">
          {sides.map(({ title, image, Icon, tags, className, tint, objectPosition, plate }) => (
            <div
              key={title}
              className={`relative aspect-[11/18] overflow-hidden rounded-[clamp(18px,5vw,34px)] ring-2 ${tint} ${className}`}
            >
              <div className="absolute inset-x-0 bottom-0 h-[76%] [mask-image:linear-gradient(to_bottom,transparent,black_30%)]">
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(min-width: 920px) 430px, 48vw"
                  className="object-cover"
                  style={{ objectPosition }}
                />
              </div>
              <div className="absolute inset-0 bg-(image:--decor-vibe-shade-top)" aria-hidden />
              <div className="relative flex flex-col gap-[clamp(6px,1.6vw,14px)] p-[clamp(8px,2.6vw,24px)] text-white">
                <div className="flex items-center gap-[clamp(6px,1.8vw,14px)]">
                  <span
                    className={`grid size-[clamp(34px,9vw,68px)] shrink-0 place-items-center rounded-[28%] shadow-(--shadow-card) ${plate}`}
                  >
                    <Icon className="size-[56%]" aria-hidden />
                  </span>
                  <p className="text-[clamp(15px,4.4vw,32px)]/[1.05] font-extrabold">{title}</p>
                </div>
                <ul className="flex flex-col items-start gap-[clamp(3px,1vw,8px)]">
                  {tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-white/30 bg-white/15 px-[clamp(7px,2vw,16px)] py-[clamp(1px,0.5vw,4px)] text-[clamp(11px,3vw,20px)] backdrop-blur-sm"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          {/* The lightning and the letters share one cell of the card row, so both sit on its centre. */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-1 grid-rows-1 place-items-center">
            <span className="col-start-1 row-start-1 h-[56%] min-[900px]:h-[68%]">
              <Image
                src="/images/vibe/vs-lightning.webp"
                alt=""
                width={368}
                height={1000}
                sizes="(min-width: 920px) 300px, 100px"
                className="h-full w-auto max-w-none"
              />
            </span>
            <span className="col-start-1 row-start-1">
              <Image
                src="/images/vibe/vs-letters.webp"
                alt=""
                width={480}
                height={465}
                sizes="(min-width: 920px) 240px, 28vw"
                className="w-[clamp(76px,24vw,240px)] max-w-none animate-vibe-beat motion-reduce:animate-none"
              />
              <span className="sr-only">против</span>
            </span>
          </div>
        </div>
        <Button
          size="lg"
          shape="pill"
          className="absolute bottom-0 left-1/2 h-[clamp(44px,11vw,72px)] w-[min(78%,520px)] -translate-x-1/2 gap-2.5 bg-[image:linear-gradient(100deg,var(--decor-violet),var(--decor-vibe-loud-from)_60%,var(--decor-vibe-loud-to))] text-[clamp(15px,4.2vw,26px)] font-extrabold text-white shadow-(--decor-vibe-button-glow) hover:scale-[1.03] active:translate-y-0"
          onClick={() => {
            setOpened(true)
            setOpen(true)
          }}
        >
          Найти свой вайб
          <ArrowRight className="size-[1.2em]" aria-hidden />
        </Button>
      </div>
      {opened && <VibeSearchDialog open={open} onOpenChange={setOpen} />}
    </section>
  )
}
