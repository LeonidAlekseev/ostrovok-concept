import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** The part of the Web Speech API the composer uses: Chrome and Safari have it as `webkitSpeechRecognition`. */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionClass = new () => Recognition

const recognitionClass = (): RecognitionClass | undefined => {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition
}

const noSubscription = () => () => {}

export interface Speech {
  /** The browser recognises speech: without it there is no microphone button. */
  supported: boolean
  listening: boolean
  /** The microphone is blocked or failed: a line under the composer says so. */
  error: string | null
  toggle: () => void
}

/**
 * Dictation in Russian: the recognised words go to `onText` (appended to the composer by the caller), nothing is
 * sent. Stops on the second press, at the end of the phrase, or when the component unmounts.
 */
export function useSpeech(onText: (text: string) => void): Speech {
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionClass() !== undefined,
    () => false,
  )
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  })
  useEffect(() => () => recognition.current?.abort(), [])

  const toggle = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    const Class = recognitionClass()
    if (!Class) return
    const r = new Class()
    r.lang = 'ru-RU'
    r.interimResults = false
    r.continuous = false
    r.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (text) onTextRef.current(text)
    }
    r.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Нет доступа к микрофону: разрешите его в настройках браузера.'
          : 'Не получилось распознать речь. Попробуйте ещё раз.',
      )
    }
    r.onend = () => {
      recognition.current = null
      setListening(false)
    }
    recognition.current = r
    setError(null)
    setListening(true)
    try {
      r.start()
    } catch {
      recognition.current = null
      setListening(false)
    }
  }, [])

  return { supported, listening, error, toggle }
}
