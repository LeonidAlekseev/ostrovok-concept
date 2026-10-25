import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Clapperboard, Download, Link2, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Reading } from '../../lib/horoscope'
import { BRAND_NAME, canShareFile, downloadFile, shareFile, shareText, videoType } from '../../lib/shareMedia'
import { renderReadingVideo } from './starVideo'

type State =
  | { kind: 'idle' }
  | { kind: 'rendering'; progress: number }
  | { kind: 'ready'; file: File; url: string; shareable: boolean }
  | { kind: 'failed' }

const RECORDING_NOTE = 'Не сворачивайте вкладку, пока идёт запись'
const RESTARTED_NOTE = 'Запись прервалась — начали заново. Не сворачивайте вкладку'
/** On the night sky of the window: the main action is violet, the others are glass with a golden hover. */
const buttonClass =
  'h-12 bg-(image:--decor-star-choice) px-3 text-base text-(--decor-star-text) shadow-(--decor-spin-shadow) hover:bg-(image:--decor-star-choice) hover:brightness-110'
const secondaryClass =
  'h-12 border-(--decor-star-line)/70 bg-(--decor-star-glass) px-3 text-base text-(--decor-star-text) hover:bg-(--decor-star-glass) hover:text-(--decor-gold)'

/** The video of the reading: rendered on request, then sent through the share sheet or downloaded. */
export function StarVideo({ reading, name }: { reading: Reading; name: string }) {
  const [type] = useState(videoType)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [note, setNote] = useState('')
  // A hidden tab dropped the recording and it began again.
  const [restarted, setRestarted] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const title = `${BRAND_NAME} Звёзды подскажут`
  const text = `${name} ${reading.sign.symbol} — звёзды выбрали мне ${reading.city.name}, ${reading.city.country}. А что выпадет тебе?`
  const site = () => window.location.origin

  // Closing the window stops the recording; the preview's object URL goes with the video.
  useEffect(() => () => abortRef.current?.abort(), [])
  const readyUrl = state.kind === 'ready' ? state.url : null
  useEffect(() => (readyUrl ? () => URL.revokeObjectURL(readyUrl) : undefined), [readyUrl])

  const run = async (action: () => Promise<string | void>) => {
    try {
      setNote((await action()) ?? '')
    } catch {
      setNote('Не удалось поделиться — попробуйте ещё раз')
    }
  }

  const render = async () => {
    if (!type) return
    const controller = new AbortController()
    abortRef.current = controller
    setNote('')
    setRestarted(false)
    setState({ kind: 'rendering', progress: 0 })
    try {
      const file = await renderReadingVideo(reading, name, type, {
        signal: controller.signal,
        // The bar moves in 1 % steps: a state update per frame would re-render the dialog 60 times a second.
        onProgress: (share) =>
          setState((prev) => {
            const progress = Math.round(share * 100) / 100
            return prev.kind === 'rendering' && prev.progress !== progress ? { kind: 'rendering', progress } : prev
          }),
        onRestart: () => setRestarted(true),
      })
      setState({ kind: 'ready', file, url: URL.createObjectURL(file), shareable: canShareFile(file) })
      setNote('Видео готово')
    } catch {
      if (controller.signal.aborted) {
        setState({ kind: 'idle' })
        setNote('Видео отменено')
      } else {
        setState({ kind: 'failed' })
        setNote('Не удалось создать видео — поделитесь ссылкой')
      }
    }
  }

  const copyLink = () =>
    run(async () => {
      await navigator.clipboard.writeText(site())
      return 'Ссылка скопирована'
    })

  let actions
  if (!type)
    // No MediaRecorder: the text of the reading and a link.
    actions = (
      <Button
        size="lg"
        className={buttonClass}
        onClick={() =>
          run(async () =>
            (await shareText({ title, text, url: site() })) === 'copied'
              ? 'Текст скопирован — вставьте его в сообщение'
              : '',
          )
        }
      >
        <Share2 aria-hidden />
        Поделиться
      </Button>
    )
  else if (state.kind === 'rendering')
    actions = (
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Создание видео"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.progress * 100)}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--decor-star-glass) ring-1 ring-(--decor-star-line)/50"
        >
          <div
            className="h-full origin-left scale-x-(--progress) rounded-full bg-(image:--decor-spin-gradient)"
            style={{ '--progress': state.progress } as CSSProperties}
          />
        </div>
        <Button variant="outline" className={`${secondaryClass} h-10`} onClick={() => abortRef.current?.abort()}>
          <X aria-hidden />
          Отменить
        </Button>
      </div>
    )
  else if (state.kind === 'ready')
    actions = (
      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <video
          src={state.url}
          className="aspect-[9/16] w-24 rounded-lg bg-(--decor-star-sky) ring-1 ring-(--decor-gold)/50"
          aria-label="Видео с предсказанием"
          muted
          loop
          autoPlay
          playsInline
        />
        <div className="flex flex-col gap-2">
          {state.shareable ? (
            <Button
              size="lg"
              className={buttonClass}
              onClick={() =>
                run(async () =>
                  (await shareFile(state.file, { title, text: `${text} ${site()}` })) ? 'Видео отправлено' : '',
                )
              }
            >
              <Share2 aria-hidden />
              Поделиться видео
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                className={buttonClass}
                onClick={() => {
                  downloadFile(state.file)
                  setNote('Видео скачивается')
                }}
              >
                <Download aria-hidden />
                Скачать видео
              </Button>
              <Button variant="outline" size="lg" className={secondaryClass} onClick={copyLink}>
                <Link2 aria-hidden />
                Скопировать ссылку
              </Button>
            </>
          )}
        </div>
      </div>
    )
  else
    actions = (
      <div className="grid gap-2">
        <Button size="lg" className={buttonClass} onClick={render}>
          <Clapperboard aria-hidden />
          Создать видео для друзей
        </Button>
        {state.kind === 'failed' && (
          <Button variant="outline" size="lg" className={secondaryClass} onClick={copyLink}>
            <Link2 aria-hidden />
            Скопировать ссылку
          </Button>
        )}
      </div>
    )

  const recording = type && state.kind === 'rendering'

  return (
    <div className="flex flex-col gap-2">
      {actions}
      <p className="min-h-5 text-center text-sm text-(--decor-star-muted)" role="status">
        {recording ? (restarted ? RESTARTED_NOTE : RECORDING_NOTE) : note}
      </p>
    </div>
  )
}
