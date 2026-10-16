import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronRight, RotateCcw, SendHorizontal, Sparkles, Star } from 'lucide-react'
import type { Destination } from '../../data/destinations'
import type { HotelSearch } from '../../hooks/useHotelSearch'
import {
  describeBrief,
  makePlan,
  mergeBrief,
  nextQuestion,
  starterChips,
  type Brief,
  type Plan,
  type Question,
} from '../../lib/assistant'
import { formatDateRange, todayIso } from '../../lib/dates'
import { countRu, formatPrice, guestsLabel } from '../../lib/format'
import { RobotAvatar } from './RobotAvatar'
import styles from './AssistantSearch.module.css'

interface Message {
  from: 'agent' | 'user'
  text: string
  plan?: Plan
}

interface Props {
  onPreview: (destination: Destination) => void
  onChoose: HotelSearch['searchFor']
}

/** A pause before the assistant replies, so the answer reads as a reply rather than an echo. */
const THINK_MS = 650

export function AssistantSearch({ onPreview, onChoose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [brief, setBrief] = useState<Brief>({})
  const [question, setQuestion] = useState<Question | null>(null)
  const [thinking, setThinking] = useState(false)
  const [text, setText] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const logRef = useRef<HTMLOListElement>(null)
  const inputId = useId()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Keep the newest message in view inside the log (not the page: that would yank the scroll).
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, thinking])

  const send = (raw: string) => {
    const wish = raw.trim()
    if (!wish || thinking) return
    setText('')
    setMessages((list) => [...list, { from: 'user', text: wish }])
    setThinking(true)
    const next = mergeBrief(brief, wish, question?.id ?? null)
    setBrief(next)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const today = todayIso()
      const ask = nextQuestion(next, today)
      const understood = describeBrief(next)
      setThinking(false)
      setQuestion(ask)
      if (ask) {
        setMessages((list) => [
          ...list,
          { from: 'agent', text: understood ? `Записал: ${understood}. ${ask.text}` : ask.text },
        ])
        return
      }
      const plan = makePlan(next, today)
      setMessages((list) => [...list, { from: 'agent', text: understood ? `Записал: ${understood}.` : '', plan }])
      if (plan.options[0]) onPreview(plan.options[0].destination)
    }, THINK_MS)
  }

  const reset = () => {
    clearTimeout(timerRef.current)
    setMessages([])
    setBrief({})
    setQuestion(null)
    setThinking(false)
    setText('')
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(text)
  }

  // Enter sends, Shift+Enter breaks the line; an IME composition is never cut short.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(text)
    }
  }

  const started = messages.length > 0
  const chips = question ? question.replies.map((label) => ({ emoji: null, label })) : starterChips

  return (
    <div className={styles.assistant}>
      <div className={`${styles.intro} ${started ? styles.introCompact : ''}`}>
        <RobotAvatar className={styles.avatar} />
        <div className={styles.introText}>
          <h2 className={styles.title}>О каком путешествии вы мечтаете?</h2>
          <p className={styles.subtitle}>Я подберу идеальное жилье и направление</p>
        </div>
        {started && (
          <button type='button' className={styles.reset} onClick={reset}>
            <RotateCcw size={16} aria-hidden />
            <span>Заново</span>
          </button>
        )}
      </div>

      {started && (
        <ol ref={logRef} className={styles.log} aria-live='polite' aria-label='Диалог с ассистентом'>
          {messages.map((message, i) => (
            <li key={i} className={message.from === 'user' ? styles.userMessage : styles.agentMessage}>
              {message.from === 'agent' && <RobotAvatar className={styles.messageAvatar} />}
              <div className={styles.bubble}>
                {message.text && <p className={styles.messageText}>{message.text}</p>}
                {message.plan && <PlanView plan={message.plan} onChoose={onChoose} />}
              </div>
            </li>
          ))}
          {thinking && (
            <li className={styles.agentMessage}>
              <RobotAvatar className={styles.messageAvatar} />
              <div className={`${styles.bubble} ${styles.typing}`} aria-label='Ассистент думает'>
                <span />
                <span />
                <span />
              </div>
            </li>
          )}
        </ol>
      )}

      <form className={styles.composer} onSubmit={onSubmit}>
        <Sparkles className={styles.composerIcon} aria-hidden />
        <label htmlFor={inputId} className='visually-hidden'>
          Опишите поездку
        </label>
        <textarea
          id={inputId}
          className={styles.input}
          rows={2}
          value={text}
          enterKeyHint='send'
          placeholder={
            started
              ? 'Ответьте или уточните пожелания…'
              : 'Например: «Хочу на море в октябре, спокойный отдых, бюджет до 70 000 ₽»'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type='submit' className={styles.send} aria-label='Отправить' disabled={!text.trim() || thinking}>
          <SendHorizontal aria-hidden />
        </button>
      </form>

      <ul className={styles.chips} aria-label={question ? 'Быстрые ответы' : 'Идеи для поездки'}>
        {chips.map(({ emoji, label }) => (
          <li key={label}>
            <button type='button' className={styles.chip} onClick={() => send(label)} disabled={thinking}>
              {emoji && (
                <span className={styles.chipEmoji} aria-hidden>
                  {emoji}
                </span>
              )}
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlanView({ plan, onChoose }: { plan: Plan; onChoose: Props['onChoose'] }) {
  const nights = countRu(plan.nights, ['ночь', 'ночи', 'ночей'])
  if (plan.options.length === 0)
    return <p className={styles.messageText}>Не нашёл подходящих вариантов — попробуйте описать поездку иначе.</p>
  return (
    <div className={styles.plan}>
      <p className={styles.atmosphere}>
        <span className={styles.atmosphereEmoji} aria-hidden>
          {plan.emoji}
        </span>
        <span>
          <span className={styles.atmosphereLabel}>Атмосфера поездки</span>
          <strong className={styles.atmosphereTitle}>{plan.atmosphere}</strong>
        </span>
      </p>
      <p className={styles.messageText}>{plan.why}</p>
      <p className={styles.planMeta}>
        {formatDateRange(plan.query.checkIn, plan.query.checkOut)} · {nights} · {guestsLabel(plan.query.guests)}
      </p>
      <ul className={styles.options}>
        {plan.options.map(({ destination, hotel, total, fitsBudget }) => (
          <li key={destination.id}>
            <button
              type='button'
              className={styles.option}
              onClick={() => void onChoose({ ...plan.query, destination: destination.name })}
            >
              <span className={styles.optionText}>
                <span className={styles.optionCity}>
                  {destination.name}
                  <span className={styles.optionCountry}>{destination.country}</span>
                </span>
                {hotel && (
                  <span className={styles.optionHotel}>
                    {hotel.name}
                    <span className={styles.optionRating}>
                      <Star size={12} fill='currentColor' strokeWidth={0} aria-hidden />
                      {hotel.rating.toFixed(1)}
                    </span>
                  </span>
                )}
              </span>
              <span className={styles.optionPrice}>
                от {formatPrice(total)}
                <span className={fitsBudget ? styles.optionHint : styles.optionOver}>
                  {fitsBudget ? `за ${nights}` : 'выше бюджета'}
                </span>
              </span>
              <ChevronRight className={styles.optionChevron} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {plan.overBudget && (
        <p className={styles.planNote}>
          В бюджет не уложился — показал самые близкие варианты. Можно сократить поездку.
        </p>
      )}
    </div>
  )
}
