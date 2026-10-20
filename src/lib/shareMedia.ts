/** Media to send to friends: a branded canvas frame, a canvas recorded into a video, sending or saving a file. */

export const BRAND_NAME = 'Островок!'
export const SLOGAN = 'Найди свой уголок'

/** MP4 where the browser records it (Safari, Chrome 126+), WebM otherwise; `null` without MediaRecorder. */
export function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return ['video/mp4', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

/** File extension of a media type: `video/mp4;codecs=…` is `mp4`. */
export const extensionOf = (type: string) => type.split(';')[0].split('/')[1]

/** A theme token as a colour canvas understands: custom properties compute to their final value. */
export const cssColor = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim()

/** The page's font stack, loaded before canvas uses it: canvas does not wait for web fonts. */
export async function brandFont(): Promise<string> {
  const family = getComputedStyle(document.body).fontFamily
  await document.fonts?.load(`800 64px ${family}`)
  return family
}

/**
 * Paints the brand over a frame of any size, as in the header: the logo on top; the slogan and the site address
 * at the bottom. Sizes follow the frame width. Returns the band between them, free for the content.
 */
export function drawBrandFrame(
  ctx: CanvasRenderingContext2D,
  font: string,
  site: string,
): { top: number; bottom: number } {
  const { width, height } = ctx.canvas
  const unit = width / 1080
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = cssColor('--primary')
  ctx.font = `800 ${112 * unit}px ${font}`
  ctx.letterSpacing = `${-0.035 * 112 * unit}px`
  ctx.fillText(BRAND_NAME, width / 2, 200 * unit)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = cssColor('--foreground')
  ctx.font = `700 ${64 * unit}px ${font}`
  ctx.fillText(SLOGAN, width / 2, height - 150 * unit)
  ctx.fillStyle = cssColor('--muted-foreground')
  ctx.font = `500 ${40 * unit}px ${font}`
  ctx.fillText(site, width / 2, height - 80 * unit)
  ctx.restore()
  return { top: 260 * unit, bottom: height - 240 * unit }
}

/** Breaks the text into lines no wider than `width` in the context's current font. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** The canvas as a PNG file. */
export const canvasToFile = (canvas: HTMLCanvasElement, name: string) =>
  new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('Empty canvas'))),
      'image/png',
    ),
  )

interface RecordOptions {
  type: string
  durationMs: number
  /** Paints the frame at `elapsed` ms. */
  draw: (elapsed: number) => void
  onProgress?: (share: number) => void
  /** Called with `true` when the recording stops for a hidden tab and `false` when it goes on. */
  onPause?: (paused: boolean) => void
  signal?: AbortSignal
}

export const VIDEO_FPS = 30

/**
 * Records `durationMs` of a canvas animation; rejects with the signal's reason when aborted. A hidden tab
 * stops animation frames, so the recording pauses with it and the animation time counts only visible time.
 */
export function recordCanvas(
  canvas: HTMLCanvasElement,
  { type, durationMs, draw, onProgress, onPause, signal }: RecordOptions,
) {
  signal?.throwIfAborted()
  const stream = canvas.captureStream(VIDEO_FPS)
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  let frame = 0
  return new Promise<Blob>((resolve, reject) => {
    // Visible time before the current visible stretch began at `resumedAt`.
    let banked = 0
    let resumedAt = performance.now()
    const elapsedNow = () => Math.min(banked + performance.now() - resumedAt, durationMs)

    const tick = () => {
      const elapsed = elapsedNow()
      draw(elapsed)
      onProgress?.(elapsed / durationMs)
      if (elapsed < durationMs) frame = requestAnimationFrame(tick)
      else recorder.stop()
    }
    const onVisibility = () => {
      if (recorder.state === 'inactive') return
      if (document.visibilityState === 'hidden') {
        if (recorder.state !== 'recording') return
        banked = elapsedNow()
        cancelAnimationFrame(frame)
        recorder.pause()
        onPause?.(true)
      } else if (recorder.state === 'paused') {
        resumedAt = performance.now()
        recorder.resume()
        onPause?.(false)
        frame = requestAnimationFrame(tick)
      }
    }

    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.onstop = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stream.getTracks().forEach((track) => track.stop())
      if (signal?.aborted) reject(signal.reason)
      else resolve(new Blob(chunks, { type }))
    }
    signal?.addEventListener(
      'abort',
      () => {
        cancelAnimationFrame(frame)
        if (recorder.state !== 'inactive') recorder.stop()
      },
      { once: true },
    )
    draw(0)
    recorder.start()
    document.addEventListener('visibilitychange', onVisibility)
    if (document.visibilityState === 'hidden') onVisibility()
    else frame = requestAnimationFrame(tick)
  })
}

/** Whether the system share sheet takes this file. */
export const canShareFile = (file: File) => Boolean(navigator.canShare?.({ files: [file] }))

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/** Opens the system share sheet with the file; `false` when the user closed it. */
export async function shareFile(file: File, data: { title: string; text: string }): Promise<boolean> {
  try {
    await navigator.share({ files: [file], ...data })
    return true
  } catch (error) {
    if (isAbort(error)) return false
    throw error
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // The download has started by the next task; the URL is not needed after that.
  setTimeout(() => URL.revokeObjectURL(url))
}

/**
 * Shares text and a link: the system share sheet, otherwise the clipboard. `copied` means the clipboard,
 * `null` that the user closed the sheet.
 */
export async function shareText(data: {
  title: string
  text: string
  url: string
}): Promise<'shared' | 'copied' | null> {
  try {
    if (navigator.share) {
      await navigator.share(data)
      return 'shared'
    }
    await navigator.clipboard.writeText(`${data.text} ${data.url}`)
    return 'copied'
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}
