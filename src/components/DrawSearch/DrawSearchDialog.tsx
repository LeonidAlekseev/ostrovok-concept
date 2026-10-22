'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Eraser, Plus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  colorShares,
  drawAnswers,
  keyboardStroke,
  MIN_PAINTED,
  PALETTE,
  paintedShare,
  type Stroke,
} from '../../lib/drawMood'
import type { RouteCardData } from '../../lib/routes'
import type { Answer } from '../../lib/vibe'
import { useVibeReading } from '../VibeSearch/useVibeReading'
import { VibeResult } from '../VibeSearch/VibeResult'
import { DrawCanvas } from './DrawCanvas'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The routes the result picks its ready-made one from. */
  routes: readonly RouteCardData[]
}

const DRAW_ERROR = 'Не удалось подобрать отели. Попробуйте ещё раз.'

const percent = (share: number) => `${Math.round(share * 100)}%`

export function DrawSearchDialog({ open, onOpenChange, routes }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [colorId, setColorId] = useState(PALETTE[0].id)
  // The drawing's answers once «Показать путешествие» is pressed; the drawing stays under the result.
  const [answers, setAnswers] = useState<Answer[] | null>(null)
  const { vibe, route, stay, failed, retry } = useVibeReading(answers, routes)
  const shares = useMemo(() => colorShares(strokes), [strokes])
  const ready = paintedShare(strokes) >= MIN_PAINTED
  // The chosen colour: the window opens on it, and the canvas comes back to it.
  const chosenRef = useRef<HTMLButtonElement>(null)
  const color = PALETTE.find((c) => c.id === colorId)!

  const restart = () => {
    setStrokes([])
    setAnswers(null)
    // The result is gone: the focus goes back to the chosen colour.
    requestAnimationFrame(() => chosenRef.current?.focus())
  }

  const status = vibe
    ? `Настроение рисунка — ${vibe.archetype.name}`
    : answers
      ? failed
        ? DRAW_ERROR
        : 'Подбираем отели…'
      : strokes.length
        ? `Мазков: ${strokes.length}`
        : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={chosenRef}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-[clamp(16px,4vw,24px)] sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="text-(length:--text-heading) font-bold">Нарисуй своё путешествие</DialogTitle>
          <DialogDescription className="text-[15px]">
            Рисуйте цветами настроения — по ним мы подберём отели и готовый маршрут.
          </DialogDescription>
        </DialogHeader>

        {vibe ? (
          <VibeResult
            vibe={vibe}
            route={route}
            stay={stay}
            onRestart={restart}
            label="Настроение рисунка"
            restartLabel="Нарисовать заново"
          >
            <ColorShares shares={shares} />
          </VibeResult>
        ) : answers ? (
          <div className="flex flex-col items-start gap-4" aria-busy={!failed}>
            <p className="text-muted-foreground">{failed ? DRAW_ERROR : 'Подбираем отели…'}</p>
            {failed && (
              <div className="flex flex-wrap gap-3">
                <Button onClick={retry}>Повторить</Button>
                <Button variant="ghost" onClick={() => setAnswers(null)}>
                  К рисунку
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <DrawCanvas
              strokes={strokes}
              colorId={colorId}
              onStroke={(stroke) => setStrokes((current) => [...current, stroke])}
            />

            <div role="group" aria-label="Палитра настроений" className="grid grid-cols-5 gap-x-1 gap-y-3">
              {PALETTE.map((c) => (
                <button
                  key={c.id}
                  ref={c.id === colorId ? chosenRef : undefined}
                  type="button"
                  aria-pressed={c.id === colorId}
                  onClick={() => setColorId(c.id)}
                  className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1 text-center break-words hyphens-auto text-[clamp(11px,2.9vw,13px)]/[1.2] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:font-semibold aria-pressed:text-foreground"
                  style={{ '--swatch': c.hex } as CSSProperties}
                >
                  <span
                    aria-hidden
                    className="size-[clamp(30px,8vw,40px)] rounded-full bg-(--swatch) shadow-(--shadow-card) ring-offset-2 ring-offset-background transition-transform group-hover:scale-110 group-aria-pressed:scale-110 group-aria-pressed:ring-3 group-aria-pressed:ring-(--swatch) motion-reduce:transition-none"
                  />
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setStrokes((current) => [...current, keyboardStroke(colorId, current.length)])}
              >
                <Plus aria-hidden />
                Добавить мазок
              </Button>
              <Button
                variant="ghost"
                disabled={!strokes.length}
                onClick={() => setStrokes((current) => current.slice(0, -1))}
              >
                <Undo2 aria-hidden />
                Отменить
              </Button>
              <Button variant="ghost" disabled={!strokes.length} onClick={() => setStrokes([])}>
                <Eraser aria-hidden />
                Очистить
              </Button>
            </div>

            <Button
              size="lg"
              className="h-12 text-base"
              disabled={!ready}
              aria-describedby={ready ? undefined : 'draw-hint'}
              onClick={() => setAnswers(drawAnswers(strokes))}
            >
              Показать путешествие
            </Button>
            {!ready && (
              <p id="draw-hint" className="-mt-2 text-center text-sm text-muted-foreground">
                Закрасьте ещё немного холста — цветом «{color.label}» или любым другим.
              </p>
            )}
          </div>
        )}

        <p className="sr-only" role="status">
          {status}
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** The colours of the drawing: one bar of their shares and the moods under it. */
function ColorShares({ shares }: { shares: ReturnType<typeof colorShares> }) {
  return (
    <section aria-labelledby="draw-colors" className="flex flex-col gap-2">
      <p id="draw-colors" className="font-semibold">
        Цвета рисунка
      </p>
      <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-muted">
        {shares.map(({ color, share }) => (
          <div
            key={color.id}
            className="w-(--share) bg-(--swatch)"
            style={{ '--share': percent(share), '--swatch': color.hex } as CSSProperties}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {shares.map(({ color, share }) => (
          <li key={color.id} className="flex items-center gap-1.5" style={{ '--swatch': color.hex } as CSSProperties}>
            <span aria-hidden className="size-3 rounded-full bg-(--swatch)" />
            {color.label} <span className="font-semibold">{percent(share)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
