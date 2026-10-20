'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useToday } from '../../hooks/useToday'
import { DEFAULT_GUESTS, withStartDates, type Stay } from '../../lib/search'
import { readVibe, VIBE_AXES, VIBE_STEPS, type Answer } from '../../lib/vibe'
import { VibeResult } from './VibeResult'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The inner side of each option is padded wider: the «vs» circle reaches 16px into it.
const optionClass =
  'flex min-h-28 items-center justify-center rounded-2xl p-3 text-center text-[clamp(19px,5vw,22px)]/[1.2] font-bold text-primary-foreground shadow-(--shadow-card) transition-transform hover:scale-[1.03] active:scale-[0.98] aria-pressed:ring-4 aria-pressed:ring-ring/60 aria-pressed:ring-offset-2'

export function VibeSearchDialog({ open, onOpenChange }: Props) {
  const today = useToday()
  // Answers stay when going back: the pair shows what was chosen.
  const [answers, setAnswers] = useState<Answer[]>([])
  const [step, setStep] = useState(0)
  const leftRef = useRef<HTMLButtonElement>(null)
  const done = step === VIBE_STEPS
  const vibe = useMemo(() => (done ? readVibe(answers) : null), [done, answers])
  // The links start tomorrow and the day after, as in the collections.
  const stay = useMemo<Stay | null>(() => {
    if (!today) return null
    const { checkIn, checkOut, guests } = withStartDates(
      { destination: '', checkIn: '', checkOut: '', guests: DEFAULT_GUESTS },
      today,
    )
    return { checkIn, checkOut, guests }
  }, [today])

  const axis = VIBE_AXES[step]
  const choose = (answer: Answer) => {
    const next = [...answers]
    next[step] = answer
    setAnswers(next)
    setStep(step + 1)
  }
  const back = () => {
    setStep(step - 1)
    // «Назад» is gone on the first pair: the focus goes to its first option.
    if (step === 1) leftRef.current?.focus()
  }
  const restart = () => {
    setAnswers([])
    setStep(0)
  }

  const status = vibe
    ? `Ваш вайб — ${vibe.archetype.name}`
    : `${step + 1} из ${VIBE_STEPS}: ${axis.left} или ${axis.right}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={leftRef}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-[clamp(16px,4vw,24px)] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-(length:--text-heading) font-bold">Поиск вайба</DialogTitle>
          <DialogDescription className="text-[15px]">
            Выберите, что ближе, — и мы подберём отели под настроение.
          </DialogDescription>
        </DialogHeader>

        {vibe ? (
          <VibeResult vibe={vibe} stay={stay} onRestart={restart} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold whitespace-nowrap text-muted-foreground">
                {step + 1} из {VIBE_STEPS}
              </p>
              <div
                role="progressbar"
                aria-label="Пара"
                aria-valuemin={1}
                aria-valuemax={VIBE_STEPS}
                aria-valuenow={step + 1}
                aria-valuetext={`${step + 1} из ${VIBE_STEPS}`}
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full origin-left scale-x-(--progress) rounded-full bg-[image:var(--decor-vibe-calm)] transition-transform"
                  style={{ '--progress': (step + 1) / VIBE_STEPS } as CSSProperties}
                />
              </div>
            </div>

            <div className="relative grid grid-cols-2 gap-3">
              <button
                ref={leftRef}
                type="button"
                aria-pressed={answers[step] === -1}
                className={cn(optionClass, 'pr-6 bg-(image:--decor-vibe-calm)')}
                onClick={() => choose(-1)}
              >
                <span key={step} className="animate-vibe-in">
                  {axis.left}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={answers[step] === 1}
                className={cn(optionClass, 'pl-6 bg-(image:--decor-vibe-loud)')}
                onClick={() => choose(1)}
              >
                <span key={step} className="animate-vibe-in">
                  {axis.right}
                </span>
              </button>
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-background text-sm font-extrabold shadow-(--shadow-card)"
              >
                vs
              </span>
            </div>

            <Button
              variant="secondary"
              size="lg"
              aria-pressed={answers[step] === 0}
              className="h-12 text-base aria-pressed:ring-2 aria-pressed:ring-ring"
              onClick={() => choose(0)}
            >
              Не могу выбрать
            </Button>
            {step > 0 && (
              <Button variant="ghost" className="self-start" onClick={back}>
                <ArrowLeft aria-hidden />
                Назад
              </Button>
            )}
          </div>
        )}

        <p className="sr-only" role="status">
          {status}
        </p>
      </DialogContent>
    </Dialog>
  )
}
