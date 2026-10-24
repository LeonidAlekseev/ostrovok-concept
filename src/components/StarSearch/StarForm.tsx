import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Compass,
  Globe,
  Moon,
  Sparkle,
  Sunrise,
  Sunset,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useDestinations } from '../Catalog/useDestinations'
import { DateField } from '../SearchForm/DateField'
import type { IsoDate } from '../../lib/dates'
import { cuspOf, daysInMonth, sunSign, zodiac, type Company, type Direction } from '../../lib/horoscope'

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
  /** Where to: by a side of the world or by a country and its city; '' is anywhere. */
  where: 'direction' | 'country'
  direction: Direction | ''
  country: string
  destinationId: string
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
const DIRECTIONS: { id: Direction; label: string; icon: typeof Sparkle; tone: string }[] = [
  { id: 'north', label: 'Север', icon: Sparkle, tone: 'fill-current text-(--decor-lavender)' },
  { id: 'south', label: 'Юг', icon: Sparkle, tone: 'fill-current text-(--decor-gold)' },
  { id: 'east', label: 'Восток', icon: Sunrise, tone: 'text-(--decor-gold)' },
  { id: 'west', label: 'Запад', icon: Sunset, tone: 'text-(--decor-magenta)' },
]
const symbolFont = "font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif]"
/** Dark violet glass of the fields on the night sky; the focus is golden, well over 3:1 against the glass. */
const glassClass =
  'border border-(--decor-star-line)/70 bg-(--decor-star-glass) text-(--decor-star-text) hover:border-(--decor-gold)/60 focus-visible:border-(--decor-gold) focus-visible:ring-3 focus-visible:ring-(--decor-gold)/60 aria-invalid:border-(--decor-star-error)'
const fieldClass = `${glassClass} h-14 rounded-2xl px-5 text-base placeholder:text-(--decor-star-muted) md:text-base`
const selectClass =
  'w-full [&>select]:h-14 [&>select]:rounded-2xl [&>select]:border-(--decor-star-line)/70 [&>select]:bg-(--decor-star-glass) [&>select]:pl-5 [&>select]:text-base [&>select]:text-(--decor-star-text) [&>select]:hover:border-(--decor-gold)/60 [&>select]:focus-visible:border-(--decor-gold) [&>select]:focus-visible:ring-(--decor-gold)/60 [&>select]:aria-invalid:border-(--decor-star-error) [&_[data-slot=native-select-icon]]:right-4 [&_[data-slot=native-select-icon]]:size-5 [&_[data-slot=native-select-icon]]:text-(--decor-gold)'
const labelClass = 'flex items-center gap-2.5 font-star text-[clamp(19px,5vw,22px)] font-semibold text-(--decor-gold)'
const iconClass = 'size-5.5 shrink-0'

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
  // The calendar offers no past day; this catches the midnight that passes while the form stays open.
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
  const checkInRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const destinations = useDestinations()
  const countries = [...new Set(destinations.map((city) => city.country))].sort((a, b) => a.localeCompare(b, 'ru'))
  const cities = [...destinations].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
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
    <form
      className="flex flex-col gap-5 [&_[data-slot=field-error]]:text-(--decor-star-error)"
      onSubmit={submit}
      noValidate
    >
      <div className="flex flex-col gap-2.5">
        <Label className={labelClass} htmlFor={`${id}-name`}>
          <UserRound className={iconClass} aria-hidden />
          Как вас зовут?
        </Label>
        <div className="relative">
          <Input
            ref={nameRef}
            id={`${id}-name`}
            className={`${fieldClass} pr-12`}
            value={answers.name}
            maxLength={24}
            autoComplete="given-name"
            placeholder="Ваше имя"
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
          <Sparkle
            className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 fill-current text-(--decor-gold)"
            aria-hidden
          />
        </div>
        <FieldError id={`${id}-name-error`}>{errors.name}</FieldError>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2.5">
        <legend className={`${labelClass} mb-2.5`}>
          <Moon className={iconClass} aria-hidden />
          Дата рождения
        </legend>
        <div className="grid grid-cols-[2fr_3fr] gap-2.5">
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
        <p id={`${id}-sign`} className="min-h-6 text-[15px] text-(--decor-star-muted)" aria-live="polite">
          {sign && (
            <>
              Ваш знак:{' '}
              <span className="font-semibold text-(--decor-gold)">
                {sign.name} <span className={symbolFont}>{`${sign.symbol}︎`}</span>
              </span>
              {cusp && ` · на границе знаков: ${cusp[0].name}/${cusp[1].name}`}
            </>
          )}
        </p>
      </fieldset>

      <div className="flex flex-col gap-2.5">
        <p className={labelClass}>
          <CalendarDays className={iconClass} aria-hidden />
          Когда едем?
        </p>
        <DateField
          single
          describedBy={`${id}-check-in-note`}
          triggerRef={checkInRef}
          triggerClassName={`${glassClass} h-14 rounded-2xl px-5 lg:h-14 [&>svg]:text-(--decor-gold) data-popup-open:border-(--decor-gold) ${errors.checkIn ? 'border-(--decor-star-error)' : ''}`}
          checkIn={answers.checkIn || defaultCheckIn}
          checkOut={answers.checkIn || defaultCheckIn}
          error={errors.checkIn}
          onChange={(checkIn) => set({ checkIn })}
        />
        <p id={`${id}-check-in-note`} className="text-sm text-(--decor-star-muted)">
          Дата заезда, выезд — через 2 ночи
        </p>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2.5">
        <legend className={`${labelClass} mb-2.5`}>
          <Compass className={iconClass} aria-hidden />
          Куда едем?
        </legend>
        <RadioGroup
          aria-label="Как выбрать место"
          className="grid grid-cols-2 gap-1 rounded-2xl border border-(--decor-star-line)/70 bg-(--decor-star-glass) p-1"
          value={answers.where}
          onValueChange={(where) => set({ where: where as StarAnswers['where'] })}
        >
          {(
            [
              ['direction', 'Направление', Sparkle],
              ['country', 'Страна', Globe],
            ] as const
          ).map(([value, label, Icon]) => (
            <RadioGroupItem
              key={value}
              value={value}
              className="flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-medium text-(--decor-star-text) transition-[background-color,box-shadow] outline-none hover:text-(--decor-gold) focus-visible:ring-3 focus-visible:ring-(--decor-gold)/70 data-checked:bg-(image:--decor-star-choice) data-checked:font-[650] data-checked:shadow-(--decor-spin-shadow) data-checked:hover:text-(--decor-star-text)"
            >
              <Icon className="size-4.5" aria-hidden />
              {label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        {answers.where === 'direction' ? (
          // Toggles, not radios: a second press clears the side, and the stars look everywhere.
          <div role="group" aria-label="Сторона света" className="grid grid-cols-4 gap-2">
            {DIRECTIONS.map(({ id: side, label, icon: Icon, tone }) => (
              <button
                key={side}
                type="button"
                aria-pressed={answers.direction === side}
                onClick={() => set({ direction: answers.direction === side ? '' : side })}
                className={`${glassClass} flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-sm font-medium outline-none aria-pressed:border-(--decor-gold) aria-pressed:bg-(image:--decor-star-choice) aria-pressed:font-[650]`}
              >
                <Icon className={`size-6 ${tone}`} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <NativeSelect
              className={selectClass}
              aria-label="Страна"
              value={answers.country}
              onChange={(e) => set({ country: e.target.value, destinationId: '' })}
            >
              <NativeSelectOption value="">Любая страна</NativeSelectOption>
              {countries.map((country) => (
                <NativeSelectOption key={country} value={country}>
                  {country}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {/* The cities of the chosen country, or all of them: a city brings its country along. */}
            <NativeSelect
              className={selectClass}
              aria-label="Город"
              value={answers.destinationId}
              onChange={(e) => {
                const city = cities.find((c) => c.id === e.target.value)
                set({ destinationId: e.target.value, country: city?.country ?? answers.country })
              }}
            >
              <NativeSelectOption value="">Любой город</NativeSelectOption>
              {cities
                .filter((city) => !answers.country || city.country === answers.country)
                .map((city) => (
                  <NativeSelectOption key={city.id} value={city.id}>
                    {city.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </div>
        )}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2.5">
        <legend className={`${labelClass} mb-2.5`}>
          <UsersRound className={iconClass} aria-hidden />С кем едем?
        </legend>
        <RadioGroup
          className="grid grid-cols-3 gap-2"
          value={answers.company}
          onValueChange={(company) => set({ company: company as Company })}
        >
          {COMPANIES.map(({ id: value, label }) => (
            <RadioGroupItem
              key={value}
              value={value}
              className={`${glassClass} h-12 rounded-2xl px-2 text-[15px] font-medium transition-[background-color,border-color,box-shadow] hover:border-(--decor-gold)/60 data-checked:border-(--decor-lavender) data-checked:bg-(image:--decor-star-choice) data-checked:font-[650] data-checked:shadow-(--decor-spin-shadow)`}
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

      {/* The owner's cosmic pill: only the middle stretches, the round ends keep their shape. */}
      <Button
        type="submit"
        size="lg"
        shape="pill"
        className="relative mt-2 h-16 w-full gap-3 bg-transparent [border-image:var(--decor-star-button-image)] text-xl text-(--decor-star-text) [text-shadow:0_1px_8px_var(--decor-star-sky)] hover:scale-[1.02] hover:bg-transparent focus-visible:ring-(--decor-gold)/80 disabled:opacity-60 disabled:saturate-50"
      >
        <Sparkle className="size-6 fill-current text-(--decor-gold)" aria-hidden />
        Гадать
        <ArrowRight className="absolute right-7 size-6" aria-hidden />
      </Button>
    </form>
  )
}
