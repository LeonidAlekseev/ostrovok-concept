import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronRight, RotateCcw, SendHorizontal, Sparkles, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Destination } from '@/data/destinations'
import type { HotelSearch } from '@/hooks/useHotelSearch'
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
          <Button variant='secondary' size='sm' shape='pill' className={styles.reset} onClick={reset}>
            <RotateCcw className='size-4' aria-hidden />
            {/* Phones show the icon only; the label stays as the button's accessible name. */}
            <span className='max-sm:sr-only'>Заново</span>
          </Button>
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
        {/* The composer draws the box and the focus state; the textarea is bare inside it. */}
        <Textarea
          id={inputId}
          className='min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-base leading-[1.4] field-sizing-fixed focus-visible:border-0 sm:text-lg md:text-lg'
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
        <Button
          type='submit'
          size='icon'
          className={`${styles.send} shadow-(--shadow-primary)`}
          aria-label='Отправить'
          disabled={!text.trim() || thinking}
        >
          <SendHorizontal aria-hidden />
        </Button>
      </form>

      <ul className={styles.chips} aria-label={question ? 'Быстрые ответы' : 'Идеи для поездки'}>
        {chips.map(({ emoji, label }) => (
          <li key={label}>
            <Button
              variant='secondary'
              shape='pill'
              className='h-[clamp(40px,10.6vw,48px)] bg-(--decor-surface-soft) px-[clamp(14px,3.6vw,20px)] text-[clamp(14px,3.7vw,16px)] font-normal text-foreground hover:bg-secondary'
              onClick={() => send(label)}
              disabled={thinking}
            >
              {emoji && (
                <span className={styles.chipEmoji} aria-hidden>
                  {emoji}
                </span>
              )}
              {label}
            </Button>
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
                    <Badge className='ml-1.5 gap-0.5'>
                      <Star fill='currentColor' strokeWidth={0} aria-hidden />
                      {hotel.rating.toFixed(1)}
                    </Badge>
                  </span>
                )}
              </span>
              <span className={styles.optionPrice}>
                от {formatPrice(total)}
                {fitsBudget ? (
                  <span className={styles.optionHint}>за {nights}</span>
                ) : (
                  <Badge variant='destructive' className='mt-0.5 ml-auto flex'>
                    выше бюджета
                  </Badge>
                )}
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
