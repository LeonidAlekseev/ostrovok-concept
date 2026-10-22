'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useToday } from '../../hooks/useToday'
import { DEFAULT_GUESTS, withStartDates, type Stay } from '../../lib/search'
import { axisShares, poleImage, VIBE_AXES, VIBE_STEPS, vibeArchetype, type Answer, type Vibe } from '../../lib/vibe'
import { SmartImage } from '../ui/SmartImage'
import { vibeHotelsAction } from './actions'
import { VibeResult } from './VibeResult'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The inner side of each caption is padded wider: the «vs» circle reaches into the photo.
const optionClass =
  'relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted text-left shadow-(--shadow-card) transition-transform hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 aria-checked:ring-4 aria-checked:ring-ring/60 aria-checked:ring-offset-2'

interface OptionProps extends Omit<ComponentProps<'button'>, 'children'> {
  image: string
  label: string
  step: number
}

/** A photo with the caption bottom left; the photo is decorative, the caption names the button. */
function Option({ image, label, step, className, ...rest }: OptionProps) {
  return (
    <button type="button" role="radio" className={cn(optionClass, className)} {...rest}>
      <SmartImage src={image} alt="" width={800} height={600} className="size-full object-cover" />
      <span aria-hidden className="absolute inset-0 bg-(image:--decor-vibe-shade)" />
      <span
        key={step}
        className="absolute inset-x-0 bottom-0 animate-vibe-in p-3 text-[clamp(16px,4.6vw,24px)]/[1.15] font-bold text-(--decor-light) sm:p-4"
      >
        {label}
      </span>
    </button>
  )
}

const VIBE_ERROR = 'Не удалось подобрать отели. Попробуйте ещё раз.'

export function VibeSearchDialog({ open, onOpenChange }: Props) {
  const today = useToday()
  // Answers stay when going back: the pair shows what was chosen.
  const [answers, setAnswers] = useState<Answer[]>([])
  const [step, setStep] = useState(0)
  const leftRef = useRef<HTMLButtonElement>(null)
  const rightRef = useRef<HTMLButtonElement>(null)
  const done = step === VIBE_STEPS
  // The server picks the hotels over the whole catalogue; the reading belongs to the answers it was asked for.
  const [reading, setReading] = useState<{ answers: Answer[]; vibe: Vibe | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!done) return
    let current = true
    vibeHotelsAction(answers).then(
      (hotels) =>
        current &&
        setReading({ answers, vibe: { archetype: vibeArchetype(answers), shares: axisShares(answers), hotels } }),
      () => current && setReading({ answers, vibe: null }),
    )
    return () => {
      current = false
    }
  }, [done, answers, attempt])
  const read = done && reading?.answers === answers ? reading : null
  const vibe = read?.vibe ?? null
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
  // The next pair's photos are fetched while this one is on screen.
  useEffect(() => {
    const next = VIBE_AXES[step + 1]
    if (next) for (const side of [-1, 1] as const) new Image().src = poleImage(next.id, side)
  }, [step])
  const choose = (answer: Answer) => {
    const next = [...answers]
    next[step] = answer
    setAnswers(next)
    setStep(step + 1)
  }
  // The arrows only move between the two options; a choice is Enter, Space or a click.
  const arrow = (event: KeyboardEvent) => {
    const toRight = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    if (!toRight && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp') return
    event.preventDefault()
    ;(toRight ? rightRef : leftRef).current?.focus()
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
    : done
      ? read
        ? VIBE_ERROR
        : 'Подбираем отели…'
      : `${step + 1} из ${VIBE_STEPS}: ${axis.left} или ${axis.right}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={leftRef}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-[clamp(16px,4vw,24px)] sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="text-(length:--text-heading) font-bold">Поиск вайба</DialogTitle>
          <DialogDescription className="text-[15px]">
            Выберите, что ближе, — и мы подберём отели под настроение.
          </DialogDescription>
        </DialogHeader>

        {vibe ? (
          <VibeResult vibe={vibe} stay={stay} onRestart={restart} />
        ) : done ? (
          <div className="flex flex-col items-start gap-4" aria-busy={!read}>
            <p className="text-muted-foreground">{read ? VIBE_ERROR : 'Подбираем отели…'}</p>
            {read && (
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    setReading(null)
                    setAttempt(attempt + 1)
                  }}
                >
                  Повторить
                </Button>
                <Button variant="ghost" onClick={restart}>
                  Заново
                </Button>
              </div>
            )}
          </div>
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
                  className="h-full origin-left scale-x-(--progress) rounded-full bg-[image:var(--decor-vibe-progress)] transition-transform"
                  style={{ '--progress': (step + 1) / VIBE_STEPS } as CSSProperties}
                />
              </div>
            </div>

            <div
              role="radiogroup"
              aria-label={`Что ближе: ${axis.left} или ${axis.right}`}
              className="relative grid grid-cols-2 gap-3"
              onKeyDown={arrow}
            >
              <Option
                ref={leftRef}
                image={poleImage(axis.id, -1)}
                label={axis.left}
                step={step}
                aria-checked={answers[step] === -1}
                tabIndex={answers[step] === 1 ? -1 : 0}
                className="[&>span:last-child]:pr-5 sm:[&>span:last-child]:pr-7"
                onClick={() => choose(-1)}
              />
              <Option
                ref={rightRef}
                image={poleImage(axis.id, 1)}
                label={axis.right}
                step={step}
                aria-checked={answers[step] === 1}
                tabIndex={answers[step] === 1 ? 0 : -1}
                className="[&>span:last-child]:pl-5 sm:[&>span:last-child]:pl-7"
                onClick={() => choose(1)}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-background text-sm sm:size-14 sm:text-base font-extrabold shadow-(--shadow-card)"
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
