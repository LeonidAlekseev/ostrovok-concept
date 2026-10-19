import { useEffect, useEffectEvent, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Dices, PencilLine, RotateCcw, Share2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Destination } from '@/data/destinations'
import { formatPrice } from '../../lib/format'
import {
  bestHotels,
  cityOf,
  drawFortune,
  prophecyFor,
  reelStrip,
  tripMoods,
  zodiac,
  type Fortune,
  type ZodiacSign,
} from '../../lib/fortune'

interface Props {
  onPreview: (destination: Destination) => void
}

type Round = { id: number; fortune: Fortune; landed: boolean }

/** Symbols each reel runs through before it stops; later reels run longer and stop later. */
const REEL_LENGTHS = [16, 22, 28]
const REEL_SECONDS = 1.4
const REEL_STAGGER = 0.7
const cityNames = [...new Set(bestHotels.map((h) => cityOf(h).name))]
const hotelNames = bestHotels.map((h) => h.name)
const CONFETTI = [1, 2, 3, 4, 5].map((n) => `var(--decor-confetti-${n})`)
// Text presentation: the emoji variants of the zodiac glyphs ignore the selected colour.
// A highlight sweeps across the spin button now and then, inviting a pull (the button clips it); the keyframes
// in globals.css move its translate from here.
const shineSweep =
  "after:absolute after:inset-0 after:-translate-x-full after:[background:linear-gradient(100deg,transparent_30%,color-mix(in_srgb,var(--decor-light)_35%,transparent)_50%,transparent_70%)] after:content-['']"
// Curved-glass shading: symbols darken as they roll over the top and bottom edges.
const windowShade =
  "after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:[background:linear-gradient(180deg,color-mix(in_srgb,var(--shadow-color)_28%,transparent),transparent_30%,transparent_70%,color-mix(in_srgb,var(--shadow-color)_28%,transparent))]"
const machineBody =
  '[background:linear-gradient(160deg,var(--decor-machine-dark),var(--primary)_60%,var(--decor-machine-indigo))] shadow-[inset_0_2px_0_color-mix(in_srgb,var(--decor-light)_18%,transparent),0_14px_30px_color-mix(in_srgb,var(--decor-machine-shadow)_30%,transparent)]'
// A marquee of bulbs along the top edge; they chase while the reels spin.
const bulbs = '[background:radial-gradient(circle,var(--decor-gold)_0_2.5px,transparent_3px)_0_50%/16px_6px_repeat-x]'
const symbolFont = "font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif]"

export function RandomSearch({ onPreview }: Props) {
  const [name, setName] = useState('')
  const [sign, setSign] = useState<ZodiacSign | null>(null)
  const [error, setError] = useState('')
  const [round, setRound] = useState<Round | null>(null)
  const [editing, setEditing] = useState(true)
  const [shareNote, setShareNote] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const nameId = useId()

  const spin = (event?: FormEvent) => {
    event?.preventDefault()
    if (!name.trim()) {
      setError('Как вас зовут? Звёздам нужно знать, кому выбирать')
      nameRef.current?.focus()
      return
    }
    if (!sign) {
      setError('Выберите знак зодиака')
      return
    }
    setError('')
    setShareNote('')
    setEditing(false)
    setRound((prev) => ({ id: (prev?.id ?? 0) + 1, fortune: drawFortune(prev?.fortune), landed: false }))
  }

  const onLanded = () => {
    setRound((r) => (r ? { ...r, landed: true } : r))
    if (round) onPreview(round.fortune.city)
  }

  // The name check runs first, so an error with an empty name is always about the name.
  const nameInvalid = Boolean(error) && !name.trim()

  if (editing || !round || !sign)
    return (
      <form className="flex flex-col" onSubmit={spin} noValidate>
        <div className="mb-[clamp(14px,3.6vw,20px)] flex items-center gap-[clamp(12px,3.4vw,20px)]">
          <span
            className="grid size-[clamp(56px,16vw,80px)] flex-none place-items-center rounded-full bg-[radial-gradient(circle_at_50%_40%,var(--decor-gold-light),var(--decor-gold))] text-[clamp(30px,8.6vw,44px)]"
            aria-hidden
          >
            🎰
          </span>
          <div>
            <h2 className="text-(length:--text-heading) leading-[1.25] font-bold">Доверьтесь звёздам</h2>
            <p className="mt-1 text-[clamp(14px,3.7vw,17px)] text-muted-foreground">
              Барабан выберет один из лучших отелей — кому как повезёт
            </p>
          </div>
        </div>

        <Label className="mb-2 text-base leading-[normal] font-semibold" htmlFor={nameId}>
          Как вас зовут?
        </Label>
        <Input
          ref={nameRef}
          id={nameId}
          className="mb-4 h-[clamp(48px,12.4vw,56px)] bg-card px-4 text-base focus-visible:ring-ring/10 sm:text-lg md:text-lg"
          aria-invalid={nameInvalid || undefined}
          value={name}
          maxLength={24}
          autoComplete="given-name"
          placeholder="Ваше имя"
          onChange={(e) => setName(e.target.value)}
        />
        <FieldError className="mx-1 -mt-2.5 mb-4">{nameInvalid && error}</FieldError>

        <fieldset className="min-w-0">
          <legend className="mb-2 block font-semibold">Кто вы по знаку зодиака?</legend>
          {/* Arrow keys move the choice inside the group; one Tab stop for the whole grid. */}
          <RadioGroup
            className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6"
            value={sign?.id ?? null}
            onValueChange={(id) => setSign(zodiac.find((z) => z.id === id) ?? null)}
          >
            {zodiac.map((z) => (
              <RadioGroupItem
                key={z.id}
                value={z.id}
                className={`flex h-10.5 min-w-0 items-center gap-1.5 overflow-hidden px-2.5 text-sm/[normal] text-ellipsis whitespace-nowrap rounded-lg border border-transparent bg-(--decor-surface-soft) transition-[background-color,border-color] hover:bg-secondary data-checked:border-primary data-checked:bg-secondary data-checked:font-[650] data-checked:text-primary`}
              >
                <span className={`flex-none text-lg/[normal] ${symbolFont}`} aria-hidden>
                  {z.symbol}
                </span>
                {z.name}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </fieldset>

        <FieldError className="mx-1 mt-3">{!nameInvalid && error}</FieldError>

        <Button
          type="submit"
          size="lg"
          className={`after:animate-slot-shine ${shineSweep} relative mt-4.5 overflow-hidden h-[clamp(52px,13.6vw,60px)] gap-2.5 bg-(image:--decor-spin-gradient) text-[clamp(17px,4.6vw,19px)] shadow-(--decor-spin-shadow)`}
        >
          <Dices className="size-6" aria-hidden />
          Крутить барабан
        </Button>
      </form>
    )

  const { fortune, landed } = round
  const share = async () => {
    const text = `${name} ${sign.symbol} — звёзды выбрали мне ${fortune.hotel.name} (${fortune.city.name}). Настроение поездки: ${fortune.mood}. А что выпадет тебе?`
    const url = window.location.origin + window.location.pathname
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Островок! Полный рандом', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      setShareNote('Текст скопирован — вставьте его в соцсети')
    } catch (e) {
      // Closing the share sheet is not an error worth reporting.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setShareNote('Не удалось поделиться — сделайте скриншот!')
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-11 flex-none place-items-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--decor-magenta))] text-2xl/[normal] text-primary-foreground ${symbolFont}`}
          aria-hidden
        >
          {sign.symbol}
        </span>
        <span>
          <span className="block font-bold">{name.trim()}</span>
          <span className="block text-sm/[normal] text-muted-foreground">{sign.name}</span>
        </span>
        <Button variant="secondary" size="sm" shape="pill" className="ml-auto" onClick={() => setEditing(true)}>
          <PencilLine className="size-4" aria-hidden />
          Изменить
        </Button>
      </div>

      <SlotMachine key={round.id} fortune={fortune} spinning={!landed} onLanded={onLanded} />

      <div aria-live="polite">
        {landed && (
          <Card
            role="article"
            className={`relative gap-0 rounded-2xl bg-(image:--decor-ticket-gradient) px-4.5 pt-4.5 pb-4 text-primary-foreground animate-in fade-in zoom-in-96 slide-in-from-bottom-[10px] animation-duration-600 ease-[cubic-bezier(0.2,1.4,0.4,1)] shadow-(--decor-ticket-shadow)`}
          >
            <Confetti />
            <p className="text-sm/[normal] font-semibold tracking-[0.06em] uppercase opacity-85">
              Звёзды выбрали для {name.trim()} {sign.symbol}
            </p>
            <h3 className="mt-1.5 text-[clamp(22px,6vw,30px)] leading-[1.1] font-extrabold tracking-[-0.02em]">
              {fortune.hotel.name}
            </h3>
            <p className="mt-1 text-base/[normal] opacity-90">
              {fortune.city.name}, {fortune.city.country}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2.5 text-base/[normal] font-semibold">
              <span
                className="inline-flex gap-0.5 text-(--decor-ticket-star) *:size-3.75"
                aria-label={`${fortune.hotel.stars} звезды`}
              >
                {Array.from({ length: fortune.hotel.stars }, (_, i) => (
                  <Star key={i} fill="currentColor" strokeWidth={0} aria-hidden />
                ))}
              </span>
              <span className="rounded-sm bg-brand px-2 py-0.5 text-brand-foreground">
                {fortune.hotel.rating.toFixed(1)}
              </span>
              <span>от {formatPrice(fortune.hotel.priceFrom)}/ночь</span>
            </p>
            <p className="mt-3 inline-block rounded-full bg-(--decor-light)/18 px-3 py-1.5 font-semibold">
              Настроение: {fortune.mood}
            </p>
            <p className="mt-3 font-hand text-[clamp(21px,5.6vw,25px)] leading-[1.2] font-semibold">
              {prophecyFor(sign, fortune.city)}
            </p>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" className="h-12.5 px-3 text-base" onClick={share} disabled={!landed}>
          <Share2 aria-hidden />
          Поделиться
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-12.5 px-3 text-base"
          onClick={() => spin()}
          disabled={!landed}
        >
          <RotateCcw aria-hidden />
          Ещё раз
        </Button>
      </div>
      {shareNote && (
        <p className="text-center text-sm/[normal] text-muted-foreground" role="status">
          {shareNote}
        </p>
      )}
    </div>
  )
}

function SlotMachine({ fortune, spinning, onLanded }: { fortune: Fortune; spinning: boolean; onLanded: () => void }) {
  const [strips] = useState(() => [
    reelStrip(cityNames, fortune.city.name, REEL_LENGTHS[0]),
    reelStrip(hotelNames, fortune.hotel.name, REEL_LENGTHS[1]),
    reelStrip(tripMoods, fortune.mood, REEL_LENGTHS[2]),
  ])
  const [go, setGo] = useState(false)
  const landedRef = useRef(false)
  const land = () => {
    if (landedRef.current) return
    landedRef.current = true
    onLanded()
  }
  const landLate = useEffectEvent(land)

  // Two frames: the strips are painted at the top first, otherwise the transition has nothing to run from.
  // The timer lands the reels even if no transition ends (the tab was hidden mid-spin).
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setGo(true))
    })
    const timer = setTimeout(landLate, (REEL_SECONDS + REEL_STAGGER * (REEL_LENGTHS.length - 1)) * 1000 + 500)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className={`${machineBody} relative mr-5.5 rounded-2xl px-3 pt-4.5 pb-3.5 [--h:clamp(52px,14vw,64px)]`}>
      <div
        className={`${spinning ? 'animate-slot-pull' : ''} absolute top-[26%] -right-5 h-[46%] w-2 origin-bottom rounded-sm bg-[linear-gradient(90deg,var(--decor-lever-dark),var(--decor-lever-light),var(--decor-lever-dark))]`}
        aria-hidden
      >
        <span className="absolute -top-3.5 left-1/2 size-5.5 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--decor-knob-light),var(--decor-knob)_55%,var(--decor-knob-dark))] shadow-[0_3px_6px_color-mix(in_srgb,var(--decor-black)_25%,transparent)]" />
      </div>
      <div
        className={`${spinning ? 'animate-slot-chase' : 'animate-slot-blink'} ${bulbs} absolute top-1.5 right-4 left-4 h-1.5 opacity-85`}
        aria-hidden
      />
      <div className="grid grid-cols-3 gap-2" aria-hidden>
        {strips.map((strip, i) => (
          <div key={i} className="min-w-0">
            <span className="mb-1.5 block text-center text-xs/[normal] font-semibold tracking-[0.08em] text-(--decor-light)/75 uppercase">
              {['Город', 'Отель', 'Настроение'][i]}
            </span>
            {/* inset-shadow, not shadow: the win flash animates box-shadow from this rim, and Tailwind puts the
                inset shadow first in the box-shadow list, where the flash's inset rim is. */}
            <div
              className={`${spinning ? '' : 'animate-slot-win'} ${windowShade} relative h-(--h) overflow-hidden rounded-lg bg-card inset-shadow-[0_0_0_2px_color-mix(in_srgb,var(--decor-gold)_60%,transparent)]`}
            >
              <ul
                className={`transition-transform duration-(--d) ease-[cubic-bezier(0.12,0.8,0.22,1.04)] ${spinning ? 'blur-[0.4px]' : ''}`}
                style={
                  {
                    '--n': strip.length,
                    '--d': `${REEL_SECONDS + i * REEL_STAGGER}s`,
                    transform: go ? `translateY(${(-100 * (strip.length - 1)) / strip.length}%)` : undefined,
                  } as CSSProperties
                }
                onTransitionEnd={i === strips.length - 1 ? land : undefined}
              >
                {strip.map((item, k) => (
                  <li
                    key={k}
                    className="flex h-(--h) items-center justify-center overflow-hidden px-1.5 text-center text-[clamp(12px,3.3vw,15px)] leading-[1.15] font-bold text-brand-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        {spinning ? 'Барабан крутится…' : `Выпало: ${fortune.city.name}, ${fortune.hotel.name}, ${fortune.mood}`}
      </p>
    </div>
  )
}

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      '--x': `${(Math.random() - 0.5) * 520}px`,
      '--y': `${-120 - Math.random() * 220}px`,
      '--r': `${(Math.random() - 0.5) * 1080}deg`,
      animationDelay: `${Math.random() * 120}ms`,
      background: CONFETTI[i % CONFETTI.length],
    })),
  )
  return (
    <div className="pointer-events-none absolute top-[30%] left-1/2" aria-hidden>
      {pieces.map((style, i) => (
        <span
          key={i}
          className={`absolute animate-confetti opacity-0 ${i % 3 === 2 ? 'size-2.5 rounded-full' : 'h-3 w-2'}`}
          style={style as CSSProperties}
        />
      ))}
    </div>
  )
}
