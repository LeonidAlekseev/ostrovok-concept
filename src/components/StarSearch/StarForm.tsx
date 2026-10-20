import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { IsoDate } from '../../lib/dates'
import { cuspOf, daysInMonth, sunSign, zodiac, type Company } from '../../lib/horoscope'

export interface StarAnswers {
  name: string
  /** Day and month of birth as typed: '' until chosen. */
  birthDay: string
  birthMonth: string
  /** '' means the default check-in. */
  checkIn: IsoDate
  company: Company
  /** For a pair; '' when unknown. */
  partnerSignId: string
}

type Errors = Partial<Record<'name' | 'birth' | 'checkIn', string>>

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
const COMPANIES: { id: Company; label: string }[] = [
  { id: 'solo', label: 'Один' },
  { id: 'pair', label: 'Вдвоём' },
  { id: 'group', label: 'Компанией' },
]
const symbolFont = "font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif]"
const fieldClass = 'h-12 bg-card px-4 text-base md:text-base'
const selectClass = 'w-full [&>select]:h-12 [&>select]:bg-card [&>select]:pl-4 [&>select]:text-base'

/** Day and month of birth, when both are chosen and the day exists in that month. */
function birthOf({ birthDay, birthMonth }: StarAnswers): { month: number; day: number } | null {
  const month = Number(birthMonth)
  const day = Number(birthDay)
  return month && day && day <= daysInMonth(month) ? { month, day } : null
}

function validate(answers: StarAnswers, today: IsoDate): Errors {
  const errors: Errors = {}
  if (!answers.name.trim()) errors.name = 'Как вас зовут? Звёздам нужно знать, для кого гадать'
  if (!answers.birthDay || !answers.birthMonth) errors.birth = 'Укажите день и месяц рождения'
  else if (!birthOf(answers)) errors.birth = 'В этом месяце нет такого дня'
  if (answers.checkIn && answers.checkIn < today) errors.checkIn = 'Дата заезда уже прошла'
  return errors
}

interface Props {
  answers: StarAnswers
  onChange: (answers: StarAnswers) => void
  onSubmit: () => void
  today: IsoDate
  defaultCheckIn: IsoDate
  nameRef: RefObject<HTMLInputElement | null>
}

export function StarForm({ answers, onChange, onSubmit, today, defaultCheckIn, nameRef }: Props) {
  const [errors, setErrors] = useState<Errors>({})
  const monthRef = useRef<HTMLSelectElement>(null)
  const dayRef = useRef<HTMLSelectElement>(null)
  const checkInRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const set = (patch: Partial<StarAnswers>) => onChange({ ...answers, ...patch })

  const birth = birthOf(answers)
  const sign = birth && sunSign(birth.month, birth.day)
  const cusp = birth && cuspOf(birth.month, birth.day)
  const monthInvalid = Boolean(errors.birth) && !answers.birthMonth
  const dayInvalid = Boolean(errors.birth) && (!answers.birthDay || Boolean(answers.birthMonth))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate(answers, today)
    setErrors(found)
    // Focus goes to the first field with an error, in the order of the form.
    if (found.name) nameRef.current?.focus()
    else if (found.birth) (answers.birthDay && !answers.birthMonth ? monthRef : dayRef).current?.focus()
    else if (found.checkIn) checkInRef.current?.focus()
    else onSubmit()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold" htmlFor={`${id}-name`}>
          Как вас зовут?
        </Label>
        <Input
          ref={nameRef}
          id={`${id}-name`}
          className={fieldClass}
          value={answers.name}
          maxLength={24}
          autoComplete="given-name"
          placeholder="Ваше имя"
          aria-invalid={Boolean(errors.name) || undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
        <FieldError id={`${id}-name-error`}>{errors.name}</FieldError>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Дата рождения</legend>
        <div className="grid grid-cols-[2fr_3fr] gap-2">
          <NativeSelect
            ref={dayRef}
            className={selectClass}
            aria-label="День"
            value={answers.birthDay}
            aria-invalid={dayInvalid || undefined}
            aria-describedby={errors.birth ? `${id}-birth-error` : `${id}-sign`}
            onChange={(e) => set({ birthDay: e.target.value })}
          >
            <NativeSelectOption value="">День</NativeSelectOption>
            {Array.from({ length: 31 }, (_, i) => (
              <NativeSelectOption key={i} value={String(i + 1)}>
                {i + 1}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            ref={monthRef}
            className={selectClass}
            aria-label="Месяц"
            value={answers.birthMonth}
            aria-invalid={monthInvalid || undefined}
            aria-describedby={errors.birth ? `${id}-birth-error` : `${id}-sign`}
            onChange={(e) => set({ birthMonth: e.target.value })}
          >
            <NativeSelectOption value="">Месяц</NativeSelectOption>
            {MONTHS.map((month, i) => (
              <NativeSelectOption key={month} value={String(i + 1)}>
                {month}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <FieldError id={`${id}-birth-error`}>{errors.birth}</FieldError>
        {/* The sign as soon as the date is known; on a cusp, both neighbours. */}
        <p id={`${id}-sign`} className="min-h-6 text-[15px] text-muted-foreground" aria-live="polite">
          {sign && (
            <>
              Ваш знак:{' '}
              <span className="font-semibold text-foreground">
                {sign.name} <span className={symbolFont}>{`${sign.symbol}\uFE0E`}</span>
              </span>
              {cusp && ` · на границе знаков: ${cusp[0].name}/${cusp[1].name}`}
            </>
          )}
        </p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold" htmlFor={`${id}-check-in`}>
          Когда едем?
        </Label>
        <Input
          ref={checkInRef}
          id={`${id}-check-in`}
          type="date"
          className={fieldClass}
          value={answers.checkIn || defaultCheckIn}
          min={today}
          aria-invalid={Boolean(errors.checkIn) || undefined}
          aria-describedby={`${id}-check-in-note`}
          onChange={(e) => set({ checkIn: e.target.value })}
        />
        <FieldError>{errors.checkIn}</FieldError>
        <p id={`${id}-check-in-note`} className="text-sm text-muted-foreground">
          Дата заезда, выезд — через 2 ночи
        </p>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">С кем едем?</legend>
        <RadioGroup
          className="grid grid-cols-3 gap-1.5"
          value={answers.company}
          onValueChange={(company) => set({ company: company as Company })}
        >
          {COMPANIES.map(({ id: value, label }) => (
            <RadioGroupItem
              key={value}
              value={value}
              className="h-11 rounded-lg border border-transparent bg-(--decor-surface-soft) px-2 text-[15px] font-medium transition-[background-color,border-color] hover:bg-secondary data-checked:border-primary data-checked:bg-secondary data-checked:font-[650] data-checked:text-primary"
            >
              {label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        {answers.company === 'pair' && (
          <NativeSelect
            className={`${selectClass} mt-1`}
            aria-label="Знак спутника"
            value={answers.partnerSignId}
            onChange={(e) => set({ partnerSignId: e.target.value })}
          >
            <NativeSelectOption value="">Знак спутника — не знаю</NativeSelectOption>
            {zodiac.map((z) => (
              <NativeSelectOption key={z.id} value={z.id}>
                {z.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </fieldset>

      <Button
        type="submit"
        size="lg"
        className="mt-1 gap-2.5 bg-(image:--decor-spin-gradient) shadow-(--decor-spin-shadow) hover:scale-[1.02]"
      >
        <Sparkles className="size-5.5" aria-hidden />
        Гадать
      </Button>
    </form>
  )
}
