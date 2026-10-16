import { useEffect, useEffectEvent, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Dices, PencilLine, RotateCcw, Share2, Star } from 'lucide-react'
import type { Destination } from '../../data/destinations'
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
import styles from './RandomSearch.module.css'

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
const CONFETTI = ['#0645e8', '#a5e87b', '#ffb020', '#ff5c8a', '#5ee7ff']

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

  if (editing || !round || !sign)
    return (
      <form className={styles.form} onSubmit={spin} noValidate>
        <div className={styles.lead}>
          <span className={styles.leadIcon} aria-hidden>
            🎰
          </span>
          <div>
            <h2 className={styles.title}>Доверьтесь звёздам</h2>
            <p className={styles.subtitle}>Барабан выберет один из лучших отелей — кому как повезёт</p>
          </div>
        </div>

        <label className={styles.label} htmlFor={nameId}>
          Как вас зовут?
        </label>
        <input
          ref={nameRef}
          id={nameId}
          className={styles.input}
          value={name}
          maxLength={24}
          autoComplete='given-name'
          placeholder='Ваше имя'
          onChange={(e) => setName(e.target.value)}
        />

        <fieldset className={styles.signs}>
          <legend className={styles.label}>Кто вы по знаку зодиака?</legend>
          <div className={styles.signGrid} role='radiogroup'>
            {zodiac.map((z) => (
              <button
                key={z.id}
                type='button'
                role='radio'
                aria-checked={sign?.id === z.id}
                className={styles.sign}
                onClick={() => setSign(z)}
              >
                <span className={styles.signSymbol} aria-hidden>
                  {z.symbol}
                </span>
                {z.name}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className={styles.error} role='alert'>
            {error}
          </p>
        )}

        <button type='submit' className={styles.spin}>
          <Dices aria-hidden />
          Крутить барабан
        </button>
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
    <div className={styles.game}>
      <div className={styles.player}>
        <span className={styles.playerSign} aria-hidden>
          {sign.symbol}
        </span>
        <span>
          <span className={styles.playerName}>{name.trim()}</span>
          <span className={styles.playerHint}>{sign.name}</span>
        </span>
        <button type='button' className={styles.edit} onClick={() => setEditing(true)}>
          <PencilLine size={16} aria-hidden />
          Изменить
        </button>
      </div>

      <SlotMachine key={round.id} fortune={fortune} spinning={!landed} onLanded={onLanded} />

      <div aria-live='polite'>
        {landed && (
          <article className={styles.ticket}>
            <Confetti />
            <p className={styles.ticketKicker}>
              Звёзды выбрали для {name.trim()} {sign.symbol}
            </p>
            <h3 className={styles.ticketHotel}>{fortune.hotel.name}</h3>
            <p className={styles.ticketCity}>
              {fortune.city.name}, {fortune.city.country}
            </p>
            <p className={styles.ticketMeta}>
              <span className={styles.ticketStars} aria-label={`${fortune.hotel.stars} звезды`}>
                {Array.from({ length: fortune.hotel.stars }, (_, i) => (
                  <Star key={i} fill='currentColor' strokeWidth={0} aria-hidden />
                ))}
              </span>
              <span className={styles.ticketRating}>{fortune.hotel.rating.toFixed(1)}</span>
              <span>от {formatPrice(fortune.hotel.priceFrom)}/ночь</span>
            </p>
            <p className={styles.ticketMood}>Настроение: {fortune.mood}</p>
            <p className={styles.prophecy}>{prophecyFor(sign, fortune.city)}</p>
          </article>
        )}
      </div>

      <div className={styles.actions}>
        <button type='button' className={styles.share} onClick={share} disabled={!landed}>
          <Share2 aria-hidden />
          Поделиться
        </button>
        <button type='button' className={styles.again} onClick={() => spin()} disabled={!landed}>
          <RotateCcw aria-hidden />
          Ещё раз
        </button>
      </div>
      {shareNote && (
        <p className={styles.shareNote} role='status'>
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
    <div className={`${styles.machine} ${spinning ? styles.machineSpinning : styles.machineWon}`}>
      <div className={styles.lever} aria-hidden>
        <span className={styles.leverBall} />
      </div>
      <div className={styles.lights} aria-hidden />
      <div className={styles.reels} aria-hidden>
        {strips.map((strip, i) => (
          <div key={i} className={styles.reel}>
            <span className={styles.reelLabel}>{['Город', 'Отель', 'Настроение'][i]}</span>
            <div className={styles.window}>
              <ul
                className={styles.strip}
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
                  <li key={k} className={styles.symbol}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <p className='visually-hidden' role='status'>
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
      '--delay': `${Math.random() * 120}ms`,
      background: CONFETTI[i % CONFETTI.length],
    })),
  )
  return (
    <div className={styles.confetti} aria-hidden>
      {pieces.map((style, i) => (
        <span key={i} style={style as CSSProperties} />
      ))}
    </div>
  )
}
