'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToday } from '../../hooks/useToday'
import { addDays } from '../../lib/dates'
import { starPersona, sunSign, type Company, type Reading } from '../../lib/horoscope'
import { bestRoute, type RouteCardData } from '../../lib/routes'
import { DEFAULT_GUESTS, startStay, type Stay } from '../../lib/search'
import { readStarsAction } from './actions'
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
      company: Company
      /** With the route of the search by meaning, when it answered. */
      reading: (Reading & { routeId?: string }) | null
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
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The routes the result picks its ready-made one from. */
  routes: readonly RouteCardData[]
}

export function StarSearchDialog({ open, onOpenChange, routes }: Props) {
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
    }
    const stay = { checkIn, checkOut: addDays(checkIn, NIGHTS), guests: DEFAULT_GUESTS }
    const symbol = sunSign(input.birthMonth, input.birthDay).symbol
    setStep({
      kind: 'reading',
      symbol,
      stay,
      name,
      company: input.company,
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
  // The search by meaning's route, or the rules: the persona of the sign and the company in the stars' city.
  const route =
    result && step.kind === 'reading'
      ? bestRoute(routes, {
          semanticId: result.routeId,
          persona: starPersona(result.sign, step.company),
          destinationId: result.city.id,
        })
      : null
  const status = result
    ? `Звёзды выбрали: ${result.hotels[0].name}, ${result.city.name}`
    : step.kind === 'reading'
      ? step.failed
        ? READING_ERROR
        : 'Звёзды совещаются…'
      : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={step.kind === 'form' ? nameRef : true}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-[clamp(16px,4vw,24px)] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-(length:--text-heading) font-bold">Поиск по звёздам</DialogTitle>
          <DialogDescription className="text-[15px]">
            Звёзды выберут город и отель по вашему знаку, Луне и дате поездки.
          </DialogDescription>
        </DialogHeader>

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
            <p className="text-muted-foreground">{READING_ERROR}</p>
            <Button onClick={() => setStep({ kind: 'form' })}>Попробовать снова</Button>
          </div>
        )}
        {step.kind === 'reading' && !step.failed && !result && (
          <StarReading
            symbol={step.symbol}
            onDone={() => setStep((current) => (current.kind === 'reading' ? { ...current, swirled: true } : current))}
          />
        )}
        {step.kind === 'reading' && result && (
          <StarResult
            reading={result}
            route={route}
            stay={step.stay}
            name={step.name}
            onRestart={() => setStep({ kind: 'form' })}
          />
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
    <div
      ref={ref}
      tabIndex={-1}
      className="grid place-items-center outline-none gap-5 rounded-2xl bg-(--decor-night) px-4 py-8 text-primary-foreground"
    >
      <MagicOrb symbol={symbol} active className="size-[clamp(160px,50vw,220px)]" />
      <p className="font-hand text-[clamp(22px,6vw,28px)] font-semibold" aria-hidden>
        Звёзды совещаются…
      </p>
    </div>
  )
}
