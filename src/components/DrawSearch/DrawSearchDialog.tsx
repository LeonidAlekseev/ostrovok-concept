'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, BedDouble, Eraser, MessageSquareText, Plus, RefreshCw, RotateCcw, XIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import {
  colorShares,
  drawAnswers,
  keyboardStroke,
  MIN_PAINTED,
  PALETTE,
  paintedShare,
  type Stroke,
} from '../../lib/drawMood'
import { vibeArchetype, type Answer } from '../../lib/vibe'
import { hotelHref } from '../../lib/search'
import { useVibeReading } from '../VibeSearch/useVibeReading'
import { VibeHotels } from '../VibeSearch/VibeHotels'
import { DrawCanvas } from './DrawCanvas'
import { RainbowButton, rainbowClass } from './RainbowButton'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The colour of the brush, shared with the palette of the section's card. */
  colorId: string
  onColorIdChange: (colorId: string) => void
}

type Step = 1 | 2 | 3

const STEPS: Record<Step, string> = {
  1: 'Нарисуй свой отдых',
  2: 'Настроение рисунка',
  3: 'Ваш отель готов!',
}

const DRAW_ERROR = 'Не удалось подобрать отели. Попробуйте ещё раз.'
/** «Подбираем отель» shows at least this long, so the mood of the drawing can be read before the result. */
const MIN_SEARCH_MS = 1500

const percent = (share: number) => `${Math.round(share * 100)}%`

/** The two sparkles after the titles of the first and the last step. */
function Sparkles() {
  return (
    <svg aria-hidden viewBox="0 0 40 32" className="ml-1.5 inline-block h-[0.8em] w-auto -translate-y-[0.25em]">
      <path d="M13 8 Q14.5 17 22 18.5 Q14.5 20 13 29 Q11.5 20 4 18.5 Q11.5 17 13 8Z" className="fill-(--decor-star)" />
      <path d="M29 1 Q30 8 36 9 Q30 10 29 17 Q28 10 22 9 Q28 8 29 1Z" className="fill-(--decor-violet)" />
    </svg>
  )
}

/**
 * The drawing window: a wizard of three steps. 1 — the canvas and the palette; 2 — the mood of the drawing while the
 * hotels are picked, then on by itself; 3 — the hotel of the mood. On phones it is a sheet from the bottom.
 */
export function DrawSearchDialog({ open, onOpenChange, colorId, onColorIdChange }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [step, setStep] = useState<Step>(1)
  // The drawing's answers once «Далее» is pressed; the drawing stays for «Изменить рисунок».
  const [answers, setAnswers] = useState<Answer[] | null>(null)
  // When the search (or its retry) started: step 3 waits for `MIN_SEARCH_MS` after it.
  const [searchedAt, setSearchedAt] = useState(0)
  const { vibe, stay, failed, retry } = useVibeReading(answers)
  const shares = useMemo(() => colorShares(strokes), [strokes])
  const archetype = useMemo(() => answers && vibeArchetype(answers), [answers])
  const ready = paintedShare(strokes) >= MIN_PAINTED
  // The chosen colour: the window opens on it.
  const chosenRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // A new step takes the focus to its title; the first opening keeps it on the chosen colour.
  const shownStep = useRef(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    titleRef.current?.focus()
  }, [step])

  // The hotels are picked: on to the result, once the search has shown long enough.
  useEffect(() => {
    if (step !== 2 || !vibe) return
    const timer = setTimeout(() => setStep(3), Math.max(0, searchedAt + MIN_SEARCH_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [step, vibe, searchedAt])

  const search = () => {
    setAnswers(drawAnswers(strokes))
    setSearchedAt(Date.now())
    setStep(2)
  }

  const searchAgain = () => {
    retry()
    setSearchedAt(Date.now())
  }

  const backToDrawing = () => {
    setAnswers(null)
    setStep(1)
  }

  const status = `Шаг ${step} из 3: ${STEPS[step]}${step === 2 && failed ? `. ${DRAW_ERROR}` : ''}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={chosenRef}
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-[clamp(14px,3vw,22px)] overflow-y-auto rounded-[clamp(24px,5vw,36px)] bg-background p-[clamp(16px,4vw,32px)] pt-[clamp(18px,3.6vw,28px)] sm:max-w-2xl max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[calc(100dvh-1rem)] max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pt-2.5 max-sm:duration-300 max-sm:data-open:slide-in-from-bottom max-sm:data-open:zoom-in-100 max-sm:data-closed:slide-out-to-bottom max-sm:data-closed:zoom-out-100"
      >
        {/* The handle of the sheet on phones. */}
        <span aria-hidden className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/25 sm:hidden" />

        <div className="flex items-center gap-[clamp(12px,3vw,24px)]">
          <p className="shrink-0 text-[clamp(18px,4.6vw,24px)] font-bold tabular-nums">
            <span aria-hidden>
              <span className="text-primary">{step}</span>
              <span className="text-muted-foreground"> / 3</span>
            </span>
            <span className="sr-only">Шаг {step} из 3</span>
          </p>
          <div aria-hidden className="flex flex-1 gap-1.5">
            {([1, 2, 3] as const).map((n) => (
              <span key={n} className={cn('h-2 flex-1 rounded-full', n <= step ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
          <DialogClose render={<Button variant="ghost" size="icon-sm" className="text-foreground" />}>
            <XIcon />
            <span className="sr-only">Закрыть</span>
          </DialogClose>
        </div>

        <div className="flex flex-col gap-2">
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="text-[clamp(24px,6.4vw,34px)]/[1.15] font-extrabold tracking-[-0.01em] outline-none"
          >
            {step === 2 ? (
              STEPS[step]
            ) : (
              // The sparkles stay on the line of the last word.
              <>
                {STEPS[step].split(' ').slice(0, -1).join(' ')}{' '}
                <span className="whitespace-nowrap">
                  {STEPS[step].split(' ').at(-1)}
                  <Sparkles />
                </span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-[clamp(15px,3.8vw,18px)]/[1.45]">
            {step === 1
              ? 'Рисуйте цветами настроения — по ним мы подберём отель.'
              : step === 2
                ? 'По цветам рисунка мы поняли настроение и подбираем под него отели.'
                : 'Отели подобраны по вашему настроению.'}
          </DialogDescription>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-[clamp(14px,3vw,20px)]">
            <div className="relative">
              <DrawCanvas
                strokes={strokes}
                colorId={colorId}
                onStroke={(stroke) => setStrokes((current) => [...current, stroke])}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={!strokes.length}
                onClick={() => setStrokes((current) => current.slice(0, -1))}
                className="absolute top-[clamp(10px,2.4vw,18px)] right-[clamp(10px,2.4vw,18px)] bg-card text-foreground shadow-(--shadow-card) hover:bg-card"
              >
                <RotateCcw aria-hidden />
                <span className="sr-only">Отменить</span>
              </Button>
              {/* The canvas from the keyboard: hidden until it has the focus. */}
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-3 left-3 not-focus-visible:sr-only"
                onClick={() => setStrokes((current) => [...current, keyboardStroke(colorId, current.length)])}
              >
                <Plus aria-hidden />
                Добавить мазок
              </Button>
            </div>

            <div
              role="group"
              aria-label="Палитра настроений"
              className="flex items-center justify-between gap-1 rounded-full bg-card shadow-(--shadow-card) px-[clamp(8px,2vw,16px)] py-[clamp(8px,1.6vw,12px)]"
            >
              {PALETTE.map((c, i) => (
                <button
                  key={c.id}
                  ref={c.id === colorId ? chosenRef : undefined}
                  type="button"
                  aria-pressed={c.id === colorId}
                  aria-label={c.label}
                  onClick={() => onColorIdChange(c.id)}
                  className="group relative size-[clamp(24px,6.4vw,44px)] rounded-full bg-(--swatch) ring-offset-[3px] ring-offset-background transition-transform hover:scale-110 aria-pressed:ring-[3px] aria-pressed:ring-primary motion-reduce:transition-none"
                  style={{ '--swatch': c.hex } as CSSProperties}
                >
                  {c.id === colorId && (
                    // The mood of the chosen colour, over it; at the edges it keeps inside the window.
                    <span
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute bottom-[calc(100%+12px)] rounded-lg bg-foreground px-3 py-1.5 text-[clamp(12px,3.2vw,14px)] font-semibold whitespace-nowrap text-background',
                        i < 2 ? 'left-0' : i > 7 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                      )}
                    >
                      {c.label}
                    </span>
                  )}
                  {c.id === colorId && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-foreground"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-[clamp(10px,2.4vw,16px)]">
              <Button
                variant="ghost"
                size="lg"
                disabled={!strokes.length}
                onClick={() => setStrokes([])}
                className="h-[clamp(52px,12vw,64px)] rounded-2xl bg-card text-foreground/80 shadow-(--shadow-card) hover:bg-card hover:text-foreground"
              >
                <Eraser aria-hidden />
                Очистить
              </Button>
              <RainbowButton
                disabled={!ready}
                aria-describedby={ready ? 'draw-hint' : undefined}
                onClick={search}
                className="h-[clamp(52px,12vw,64px)] rounded-2xl text-[clamp(17px,4.4vw,22px)]"
              >
                Далее
                <ArrowRight aria-hidden />
              </RainbowButton>
            </div>
            {ready && (
              // Read by screen readers only: «Далее» is described by it once it is enabled.
              <p id="draw-hint" className="sr-only">
                По цветам рисунка подберём отели.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-[clamp(16px,3.4vw,24px)]">
            {archetype && (
              <div className="flex flex-col gap-1 rounded-3xl bg-card p-[clamp(16px,3.6vw,24px)]">
                <p className="text-sm font-semibold text-muted-foreground">Ваше настроение</p>
                <p className="text-[clamp(22px,5.6vw,30px)]/[1.2] font-extrabold">{archetype.name}</p>
                <p className="text-[15px] text-muted-foreground">{archetype.description}</p>
              </div>
            )}
            <ColorShares shares={shares} />
            {failed ? (
              <div className="flex flex-col items-start gap-3">
                <p>{DRAW_ERROR}</p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={searchAgain}>
                    <RefreshCw aria-hidden />
                    Повторить
                  </Button>
                  <Button variant="ghost" onClick={backToDrawing}>
                    К рисунку
                  </Button>
                </div>
              </div>
            ) : (
              <Progress
                value={vibe ? 100 : null}
                aria-busy={!vibe}
                className="gap-2.5 **:data-[slot=progress-indicator]:bg-(image:--decor-rainbow) **:data-[slot=progress-indicator]:data-indeterminate:w-2/5 **:data-[slot=progress-indicator]:data-indeterminate:animate-draw-progress **:data-[slot=progress-indicator]:motion-reduce:data-indeterminate:w-full **:data-[slot=progress-indicator]:motion-reduce:data-indeterminate:animate-none **:data-[slot=progress-indicator]:motion-reduce:data-indeterminate:opacity-40 **:data-[slot=progress-track]:h-2.5"
              >
                <ProgressLabel className="text-base font-semibold">Подбираем отель…</ProgressLabel>
              </Progress>
            )}
          </div>
        )}

        {step === 3 && vibe && (
          <div className="flex flex-col gap-[clamp(14px,3vw,22px)]">
            <picture>
              <source media="(min-width: 640px)" srcSet="/images/draw/result.webp" />
              <img
                src="/images/draw/result-mobile.webp"
                alt="Острова в океане"
                width={720}
                height={405}
                className="aspect-video w-full rounded-[clamp(18px,4vw,28px)] object-cover shadow-(--shadow-card)"
              />
            </picture>

            <ul className="grid auto-cols-fr grid-flow-col gap-[clamp(8px,2vw,14px)]">
              <Feature icon={<BedDouble aria-hidden />} tone="bg-primary/10 text-primary">
                Отели под настроение
              </Feature>
              <Feature icon={<MessageSquareText aria-hidden />} tone="bg-(--decor-violet)/12 text-(--decor-violet)">
                Фото и отзывы гостей
              </Feature>
            </ul>

            <VibeHotels hotels={vibe.hotels} stay={stay} />

            <div className="sticky -bottom-[clamp(16px,4vw,32px)] z-10 -mx-[clamp(16px,4vw,32px)] grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] *:whitespace-normal gap-[clamp(10px,2.4vw,16px)] bg-background/95 px-[clamp(16px,4vw,32px)] py-3 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="lg"
                onClick={backToDrawing}
                className="h-[clamp(52px,12vw,64px)] rounded-2xl bg-card px-3 text-[clamp(14px,3.6vw,17px)] text-foreground/80 shadow-(--shadow-card) hover:bg-card hover:text-foreground"
              >
                <RefreshCw aria-hidden />
                Изменить рисунок
              </Button>
              {vibe.hotels[0] && (
                <Link
                  href={hotelHref(vibe.hotels[0].id, stay)}
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    rainbowClass,
                    'h-[clamp(52px,12vw,64px)] gap-2 rounded-2xl px-3 text-[clamp(14px,3.8vw,19px)]',
                  )}
                >
                  Посмотреть отель
                  <ArrowRight aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}

        <p className="sr-only" role="status">
          {status}
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** A plaque of the result: what the drawing has really given. */
function Feature({ icon, tone, children }: { icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <li className="flex flex-col items-center gap-2 rounded-2xl bg-card p-[clamp(10px,2.4vw,12px)] text-center text-[clamp(13px,3.4vw,15px)]/[1.3] sm:flex-row sm:gap-3 sm:text-left">
      <span
        className={cn('grid size-[clamp(38px,9vw,44px)] shrink-0 place-items-center rounded-full [&_svg]:size-5', tone)}
      >
        {icon}
      </span>
      {children}
    </li>
  )
}

/** The colours of the drawing: one bar of their shares and the moods under it. */
function ColorShares({ shares }: { shares: ReturnType<typeof colorShares> }) {
  return (
    <section aria-labelledby="draw-colors" className="flex flex-col gap-2">
      <p id="draw-colors" className="font-semibold">
        Цвета рисунка
      </p>
      <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-muted">
        {shares.map(({ color, share }) => (
          <div
            key={color.id}
            className="w-(--share) bg-(--swatch)"
            style={{ '--share': percent(share), '--swatch': color.hex } as CSSProperties}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {shares.map(({ color, share }) => (
          <li key={color.id} className="flex items-center gap-1.5" style={{ '--swatch': color.hex } as CSSProperties}>
            <span aria-hidden className="size-3 rounded-full bg-(--swatch)" />
            {color.label} <span className="font-semibold">{percent(share)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
