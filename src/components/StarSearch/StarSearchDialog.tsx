'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToday } from '../../hooks/useToday'
import { addDays } from '../../lib/dates'
import { sunSign, type Reading } from '../../lib/horoscope'
import { DEFAULT_GUESTS, startStay, type Stay } from '../../lib/search'
import { readStarsAction } from './actions'
import { starSerif } from './starFont'
import { MagicOrb } from './MagicOrb'
import { StarForm, type StarAnswers } from './StarForm'
import { StarResult } from './StarResult'

/** Length of the reading's animation; the orb's reveal in globals.css lasts as long. */
export const READING_MS = 2500
/** The stay of a reading: as in the search, two adults in one room; two nights from the check-in. */
const NIGHTS = 2

/**
 * The reading: the orb swirls while the server reads the stars; the result shows once both are done.
 * `reading` is `null` until the server answers, `failed` when it could not.
 */
type Step =
  | { kind: 'form' }
  | {
      kind: 'reading'
      symbol: string
      stay: Stay
      name: string
      reading: Reading | null
      failed: boolean
      swirled: boolean
    }

const READING_ERROR = 'Звёзды не ответили. Попробуйте ещё раз.'

const emptyAnswers: StarAnswers = {
  name: '',
  birthDay: '',
  birthMonth: '',
  checkIn: '',
  company: 'solo',
  partnerSignId: '',
  where: 'direction',
  direction: '',
  country: '',
  destinationId: '',
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StarSearchDialog({ open, onOpenChange }: Props) {
  const today = useToday()
  const [answers, setAnswers] = useState(emptyAnswers)
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const nameRef = useRef<HTMLInputElement>(null)
  // The check-in of the search by default: tomorrow.
  const start = startStay(today)
  const defaultCheckIn = start?.checkIn ?? ''

  const read = () => {
    const checkIn = answers.checkIn || defaultCheckIn
    const name = answers.name.trim()
    const input = {
      name,
      birthMonth: Number(answers.birthMonth),
      birthDay: Number(answers.birthDay),
      checkIn,
      company: answers.company,
      partnerSignId: answers.partnerSignId || undefined,
      // Only the way of choosing on screen counts: a country left behind in the other tab does not.
      ...(answers.where === 'direction'
        ? { direction: answers.direction || undefined }
        : { country: answers.country || undefined, destinationId: answers.destinationId || undefined }),
    }
    const stay = { checkIn, checkOut: addDays(checkIn, NIGHTS), guests: DEFAULT_GUESTS }
    const symbol = sunSign(input.birthMonth, input.birthDay).symbol
    setStep({
      kind: 'reading',
      symbol,
      stay,
      name,
      reading: null,
      failed: false,
      swirled: prefersReducedMotion(),
    })
    // Only the reading still on screen takes the answer: «Заново» or a new reading drop the old one.
    const settle = (patch: Partial<Step>) =>
      setStep((current) => (current.kind === 'reading' && current.stay === stay ? { ...current, ...patch } : current))
    readStarsAction(input).then(
      (reading) => settle({ reading }),
      () => settle({ failed: true }),
    )
  }

  const result = step.kind === 'reading' && step.reading && step.swirled ? step.reading : null
  // The stars' answer is their city; its hotels open as a selection on /search.
  const status = result
    ? `Звёзды выбрали: ${result.city.name}`
    : step.kind === 'reading'
      ? step.failed
        ? READING_ERROR
        : 'Звёзды совещаются…'
      : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={step.kind === 'form' ? nameRef : true}
        showCloseButton={false}
        // The owner's night sky with a thin golden frame inside: the outline stays put while the window scrolls.
        className={`${starSerif.variable} max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-[clamp(22px,6vw,32px)] bg-(--decor-star-sky) bg-[image:var(--decor-star-veil),url(/images/stars/modal-bg-mobile.webp)] bg-cover bg-center px-[clamp(22px,6.5vw,44px)] py-[clamp(26px,7vw,44px)] text-(--decor-star-text) shadow-[0_24px_80px_color-mix(in_srgb,var(--decor-violet)_45%,transparent)] ring-(--decor-gold)/35 outline-1 outline-solid -outline-offset-[clamp(9px,2.6vw,14px)] outline-(--decor-gold)/55 sm:max-w-[560px] sm:bg-[image:var(--decor-star-veil),url(/images/stars/modal-bg.webp)]`}
      >
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              shape="pill"
              className="absolute top-[clamp(16px,4.4vw,24px)] right-[clamp(16px,4.4vw,24px)] z-10 size-11 border border-(--decor-gold)/40 bg-(--decor-star-glass) text-(--decor-star-text) hover:bg-(--decor-star-glass) hover:text-(--decor-gold) focus-visible:ring-(--decor-gold)/70"
            />
          }
        >
          <XIcon className="size-5" />
          <span className="sr-only">Закрыть</span>
        </DialogClose>
        <div className="grid grid-cols-[1fr_auto] items-start">
          <DialogHeader className="gap-3 pt-[clamp(4px,1.5vw,10px)]">
            <DialogTitle className="bg-(image:--decor-gold-gradient) bg-clip-text pr-2 font-star text-[clamp(31px,8.6vw,50px)]/[1.05] font-semibold text-transparent">
              Звёзды <br />
              подскажут
            </DialogTitle>
            <DialogDescription className="max-w-[34ch] text-[clamp(14px,3.8vw,16px)] text-(--decor-star-muted)">
              Звёзды выберут город и отель по вашему знаку, Луне и дате поездки.
            </DialogDescription>
          </DialogHeader>
          {/* Under the close button, leaning on the frame; its own column, so it never covers the title. */}
          <MagicOrb className="mt-12 size-[clamp(78px,21vw,150px)] sm:mt-8" />
        </div>

        {step.kind === 'form' && (
          <StarForm
            answers={answers}
            onChange={setAnswers}
            onSubmit={read}
            today={today}
            nameRef={nameRef}
            defaultCheckIn={defaultCheckIn}
          />
        )}
        {step.kind === 'reading' && step.failed && (
          <div className="flex flex-col items-start gap-4">
            <p className="text-(--decor-star-muted)">{READING_ERROR}</p>
            <Button
              variant="outline"
              className="border-(--decor-star-line) bg-(--decor-star-glass) text-(--decor-star-text) hover:bg-(--decor-star-glass) hover:text-(--decor-gold)"
              onClick={() => setStep({ kind: 'form' })}
            >
              Попробовать снова
            </Button>
          </div>
        )}
        {step.kind === 'reading' && !step.failed && !result && (
          <StarReading
            symbol={step.symbol}
            onDone={() => setStep((current) => (current.kind === 'reading' ? { ...current, swirled: true } : current))}
          />
        )}
        {step.kind === 'reading' && result && (
          <StarResult reading={result} stay={step.stay} name={step.name} onRestart={() => setStep({ kind: 'form' })} />
        )}

        <p className="sr-only" role="status">
          {status}
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** The orb swirls and the sign's symbol surfaces; then the result. */
function StarReading({ symbol, onDone }: { symbol: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useEffectEvent(onDone)
  useEffect(() => {
    // The submit button is gone: keep the focus inside the window.
    ref.current?.focus()
    const timer = setTimeout(done, READING_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div ref={ref} tabIndex={-1} className="grid place-items-center gap-6 py-[clamp(24px,7vw,48px)] outline-none">
      <MagicOrb symbol={symbol} active className="size-[clamp(170px,52vw,240px)]" />
      <p
        className="bg-(image:--decor-gold-gradient) bg-clip-text font-star text-[clamp(24px,6.6vw,32px)] font-semibold text-transparent"
        aria-hidden
      >
        Звёзды совещаются…
      </p>
    </div>
  )
}
