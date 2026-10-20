import { useEffect, useState } from 'react'
import { Download, Link2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND_NAME, canShareFile, downloadFile, shareFile } from '../../lib/shareMedia'
import type { Vibe } from '../../lib/vibe'
import { renderVibeImage } from './vibeImage'

type State = { kind: 'rendering' } | { kind: 'ready'; file: File; url: string; shareable: boolean } | { kind: 'failed' }

const buttonClass = 'h-12 px-3 text-base'

/** The picture of the vibe: painted with the result, then sent through the share sheet or downloaded. */
export function VibeImage({ vibe }: { vibe: Vibe }) {
  const [state, setState] = useState<State>({ kind: 'rendering' })
  const [note, setNote] = useState('')

  const title = `${BRAND_NAME} Поиск вайба`
  const text = `Мой вайб — «${vibe.archetype.name}». А какой у тебя?`
  const site = () => window.location.origin

  useEffect(() => {
    let live = true
    renderVibeImage(vibe).then(
      (file) =>
        live && setState({ kind: 'ready', file, url: URL.createObjectURL(file), shareable: canShareFile(file) }),
      () => {
        if (!live) return
        setState({ kind: 'failed' })
        setNote('Не удалось создать картинку — поделитесь ссылкой')
      },
    )
    return () => {
      live = false
    }
  }, [vibe])
  // The preview's object URL goes with the picture.
  const readyUrl = state.kind === 'ready' ? state.url : null
  useEffect(() => (readyUrl ? () => URL.revokeObjectURL(readyUrl) : undefined), [readyUrl])

  const run = async (action: () => Promise<string>) => {
    try {
      setNote(await action())
    } catch {
      setNote('Не удалось поделиться — попробуйте ещё раз')
    }
  }

  const copyLink = () =>
    run(async () => {
      await navigator.clipboard.writeText(site())
      return 'Ссылка скопирована'
    })

  const linkButton = (
    <Button variant="secondary" size="lg" className={buttonClass} onClick={copyLink}>
      <Link2 aria-hidden />
      Скопировать ссылку
    </Button>
  )

  let actions
  if (state.kind === 'ready')
    actions = (
      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <img
          src={state.url}
          alt={`Картинка «Мой вайб — ${vibe.archetype.name}»`}
          width={1080}
          height={1350}
          className="h-auto w-24 rounded-lg bg-muted shadow-(--shadow-card)"
        />
        <div className="flex flex-col gap-2">
          {state.shareable ? (
            <Button
              size="lg"
              className={buttonClass}
              onClick={() =>
                run(async () =>
                  (await shareFile(state.file, { title, text: `${text} ${site()}` })) ? 'Картинка отправлена' : '',
                )
              }
            >
              <Share2 aria-hidden />
              Поделиться
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                className={buttonClass}
                onClick={() => {
                  downloadFile(state.file)
                  setNote('Картинка скачивается')
                }}
              >
                <Download aria-hidden />
                Скачать картинку
              </Button>
              {linkButton}
            </>
          )}
        </div>
      </div>
    )
  else if (state.kind === 'failed') actions = linkButton
  else actions = <div className="h-30 animate-pulse rounded-lg bg-muted" aria-hidden />

  return (
    <div className="flex flex-col gap-2">
      {actions}
      <p className="min-h-5 text-center text-sm text-muted-foreground" role="status">
        {note}
      </p>
    </div>
  )
}
