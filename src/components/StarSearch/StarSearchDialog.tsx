'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToday } from '../../hooks/useToday'
import { loadAllHotels, loadDestinations } from '../../lib/catalogSource'
import { addDays } from '../../lib/dates'
import { readStars, type Reading } from '../../lib/horoscope'
import { DEFAULT_GUESTS, startStay, type Stay } from '../../lib/search'
import { MagicOrb } from './MagicOrb'
import { StarForm, type StarAnswers } from './StarForm'
import { StarResult } from './StarResult'

/** Length of the reading's animation; the orb's reveal in globals.css lasts as long. */
export const READING_MS = 2500
/** The stay of a reading: as in the search, two adults in one room; two nights from the check-in. */
const NIGHTS = 2

type Step = { kind: 'form' } | { kind: 'reading' | 'result'; reading: Reading; stay: Stay; name: string }

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
    const reading = readStars(
      {
        name,
        birthMonth: Number(answers.birthMonth),
        birthDay: Number(answers.birthDay),
        checkIn,
        company: answers.company,
        partnerSignId: answers.partnerSignId || undefined,
      },
      loadDestinations(),
      loadAllHotels(),
    )
    const stay = { checkIn, checkOut: addDays(checkIn, NIGHTS), guests: DEFAULT_GUESTS }
    setStep({ kind: prefersReducedMotion() ? 'result' : 'reading', reading, stay, name })
  }

  const status =
    step.kind === 'reading'
      ? 'Звёзды совещаются…'
      : step.kind === 'result'
        ? `Звёзды выбрали: ${step.reading.hotels[0].name}, ${step.reading.city.name}`
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
        {step.kind === 'reading' && (
          <StarReading symbol={step.reading.sign.symbol} onDone={() => setStep({ ...step, kind: 'result' })} />
        )}
        {step.kind === 'result' && (
          <StarResult
            reading={step.reading}
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
