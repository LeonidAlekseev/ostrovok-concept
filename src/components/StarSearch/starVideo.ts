import { lowerFirst, type Reading } from '../../lib/horoscope'
import { brandFont, cssColor, drawBrandFrame, extensionOf, recordCanvas, wrapText } from '../../lib/shareMedia'
import { starSerif } from './starFont'

export const VIDEO_WIDTH = 1080
export const VIDEO_HEIGHT = 1920
export const VIDEO_MS = 8000

/** Scenes: the orb reveals the sign, then the forecast, then the hotel. */
const FORECAST_AT = 2800
const HOTEL_AT = 5400
const FADE_MS = 400

const clamp = (x: number) => Math.min(1, Math.max(0, x))
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3
/** Opacity of a scene from `from` to `to` ms, fading in and out. */
const sceneAlpha = (t: number, from: number, to: number) =>
  Math.min(clamp((t - from) / FADE_MS), to === Infinity ? 1 : clamp((to - t) / FADE_MS))

type Palette = Record<
  'primary' | 'violet' | 'magenta' | 'indigo' | 'gold' | 'goldDeep' | 'light' | 'lavender' | 'sky' | 'line',
  string
>

/** The colours of the star search window: the night sky, violet glass and gold. */
const readPalette = (): Palette => ({
  primary: cssColor('--primary'),
  violet: cssColor('--decor-violet'),
  magenta: cssColor('--decor-magenta'),
  indigo: cssColor('--decor-indigo'),
  gold: cssColor('--decor-gold'),
  goldDeep: cssColor('--decor-gold-deep'),
  light: cssColor('--decor-light'),
  lavender: cssColor('--decor-lavender'),
  sky: cssColor('--decor-star-sky'),
  line: cssColor('--decor-star-line'),
})

/** Loads a picture of the video. It is decoded before the recording starts; null if it did not load. */
export async function loadPicture(src: string): Promise<HTMLImageElement | null> {
  try {
    const image = new Image()
    image.src = src
    await image.decode()
    return image
  } catch {
    return null
  }
}

/**
 * The window's antiqua for the titles, loaded before canvas uses it. Not a reason to fail the video: next/font's
 * fallback face is a local font that a system may lack, and then the load rejects; the stack falls back anyway.
 */
async function serifFont(): Promise<string> {
  const family = starSerif.style.fontFamily
  await document.fonts?.load(`600 64px ${family}`, 'Звёзды').catch(() => undefined)
  return family
}

/** The window's sky: the owner's picture over the whole frame, or a night gradient without it. */
function drawSky(ctx: CanvasRenderingContext2D, p: Palette, sky: HTMLImageElement | HTMLCanvasElement | null) {
  if (sky) {
    const scale = Math.max(VIDEO_WIDTH / sky.width, VIDEO_HEIGHT / sky.height)
    const [w, h] = [sky.width * scale, sky.height * scale]
    ctx.drawImage(sky, (VIDEO_WIDTH - w) / 2, (VIDEO_HEIGHT - h) / 2, w, h)
    return
  }
  const night = ctx.createLinearGradient(0, 0, 0, VIDEO_HEIGHT)
  night.addColorStop(0, p.sky)
  night.addColorStop(0.6, p.indigo)
  night.addColorStop(1, p.sky)
  ctx.fillStyle = night
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT)
}

/**
 * The thin golden frame of the window, with a fainter line inside. The glow is a wide faint stroke: a shadowBlur
 * over the whole frame would cost every frame of the recording.
 */
function drawGoldFrame(ctx: CanvasRenderingContext2D, p: Palette) {
  ctx.save()
  ctx.strokeStyle = p.gold
  ctx.beginPath()
  ctx.roundRect(40, 40, VIDEO_WIDTH - 80, VIDEO_HEIGHT - 80, 56)
  ctx.lineWidth = 12
  ctx.globalAlpha = 0.15
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.75
  ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.3
  ctx.beginPath()
  ctx.roundRect(58, 58, VIDEO_WIDTH - 116, VIDEO_HEIGHT - 116, 42)
  ctx.stroke()
  ctx.restore()
}

/** Gold as in the window's titles: from white through gold to deep gold, top to bottom of a line of `size` px. */
function goldText(ctx: CanvasRenderingContext2D, p: Palette, baseline: number, size: number) {
  const gold = ctx.createLinearGradient(0, baseline - size * 0.8, 0, baseline + size * 0.15)
  gold.addColorStop(0, p.light)
  gold.addColorStop(0.45, p.gold)
  gold.addColorStop(1, p.goldDeep)
  return gold
}

/** The magic orb: the picture, or without it a swirl of the window's colours; sparkles around. */
function drawOrb(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  orb: HTMLImageElement | null,
  x: number,
  y: number,
  r: number,
  t: number,
) {
  if (orb) {
    ctx.drawImage(orb, x - r * 1.25, y - r * 1.25, r * 2.5, r * 2.5)
  } else {
    drawSwirlOrb(ctx, p, x, y, r, t)
  }
  drawSparkles(ctx, p, x, y, r, t)
}

function drawSwirlOrb(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, t: number) {
  ctx.save()
  const glow = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 1.6)
  glow.addColorStop(0, p.violet)
  glow.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.45
  ctx.fillStyle = glow
  ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2)
  ctx.globalAlpha = 1

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  const swirl = ctx.createConicGradient(t / 900, x, y)
  ;[p.violet, p.magenta, p.primary, p.line, p.violet].forEach((c, i, all) =>
    swirl.addColorStop(i / (all.length - 1), c),
  )
  ctx.fillStyle = swirl
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  const nebula = ctx.createRadialGradient(x + r * 0.2, y + r * 0.25, 0, x, y, r)
  nebula.addColorStop(0, p.magenta)
  nebula.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t / 500)
  ctx.fillStyle = nebula
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  // The golden star in the heart of the orb, as in the picture.
  const core = ctx.createRadialGradient(x, y, 0, x, y, r * 0.45)
  core.addColorStop(0, p.light)
  core.addColorStop(0.35, p.gold)
  core.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.85
  ctx.fillStyle = core
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 0.9)
  shine.addColorStop(0, p.light)
  shine.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.45
  ctx.fillStyle = shine
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = p.gold
  ctx.lineWidth = r / 60
  ctx.globalAlpha = 0.8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawSparkles(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, t: number) {
  ctx.save()
  ctx.fillStyle = p.gold
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.4 + t / 2400
    const dist = r * (1.15 + 0.25 * Math.sin(i * 1.7))
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t / 400 + i))
    ctx.beginPath()
    ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, (r / 40) * (1 + (i % 3)), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSymbol(ctx: CanvasRenderingContext2D, p: Palette, symbol: string, x: number, y: number, size: number) {
  ctx.save()
  ctx.fillStyle = p.light
  ctx.shadowColor = p.gold
  ctx.shadowBlur = size / 4
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Text presentation: the emoji variants of the zodiac glyphs ignore the colour.
  ctx.font = `${size}px 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', 'Noto Sans Symbols 2', sans-serif`
  ctx.fillText(`${symbol}\uFE0E`, x, y)
  ctx.restore()
}

/** The stars' choice the video ends on: the route, or the hotel without routes. */
export interface StarPick {
  title: string
  /** City and country. */
  place: string
  /** «≈ 84 000 ₽ за 5 ночей», or the hotel's price. */
  estimate: string
}

interface Style {
  p: Palette
  /** The brand's font for the text, the window's antiqua for the titles. */
  font: string
  serif: string
  site: string
  orb: HTMLImageElement | null
  /** The picture, or the sky already painted at the frame's size. */
  sky: HTMLImageElement | HTMLCanvasElement | null
}

/** Paints frame `t` (ms) of the reading's video: the window's sky, gold frame and orb. */
export function drawReadingFrame(
  ctx: CanvasRenderingContext2D,
  reading: Reading,
  name: string,
  pick: StarPick,
  t: number,
  { p, font, serif, site, orb, sky }: Style,
) {
  const W = VIDEO_WIDTH
  drawSky(ctx, p, sky)
  drawGoldFrame(ctx, p)
  drawBrandFrame(ctx, font, site, { logo: p.light, slogan: p.gold, site: p.lavender })
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 1. The orb and the sign.
  const intro = sceneAlpha(t, -FADE_MS, FORECAST_AT)
  if (intro > 0) {
    ctx.globalAlpha = intro
    drawOrb(ctx, p, orb, W / 2, 790, 300, t)
    const reveal = ease((t - 600) / 1400)
    ctx.globalAlpha = intro * reveal
    drawSymbol(ctx, p, reading.sign.symbol, W / 2, 790, 220 * (0.5 + 0.5 * reveal))
    ctx.fillStyle = goldText(ctx, p, 1290, 80)
    ctx.font = `600 80px ${serif}`
    ctx.fillText(`${name} · ${reading.sign.name}`, W / 2, 1290, 920)
    ctx.fillStyle = p.lavender
    ctx.font = `500 46px ${font}`
    ctx.fillText(`Луна: ${reading.moon.sign.name}, ${lowerFirst(reading.moon.phase.name)}`, W / 2, 1375, 920)
  }

  // 2. The forecast.
  const forecast = sceneAlpha(t, FORECAST_AT, HOTEL_AT)
  if (forecast > 0) {
    ctx.globalAlpha = forecast
    drawOrb(ctx, p, orb, W / 2, 480, 130, t)
    drawSymbol(ctx, p, reading.sign.symbol, W / 2, 480, 120)
    const rise = (1 - ease((t - FORECAST_AT) / 600)) * 40
    ctx.fillStyle = goldText(ctx, p, 770 + rise, 64)
    ctx.font = `600 64px ${serif}`
    ctx.fillText('Звёзды говорят', W / 2, 770 + rise)
    ctx.fillStyle = p.light
    ctx.font = `600 52px ${font}`
    const lines = wrapText(ctx, reading.forecast, 880)
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 880 + i * 74 + rise))
  }

  // 3. The stars' choice: a card of the window's glass in a golden line.
  const pickAlpha = sceneAlpha(t, HOTEL_AT, Infinity)
  if (pickAlpha > 0) {
    const rise = (1 - ease((t - HOTEL_AT) / 700)) * 60
    ctx.globalAlpha = pickAlpha
    ctx.save()
    ctx.translate(0, rise)
    ctx.beginPath()
    ctx.roundRect(90, 400, 900, 1000, 48)
    // The violet glow around the card: a wide faint stroke, cheaper than a shadow (see drawGoldFrame).
    ctx.strokeStyle = p.violet
    ctx.lineWidth = 40
    ctx.globalAlpha = pickAlpha * 0.25
    ctx.stroke()
    ctx.globalAlpha = pickAlpha * 0.85
    ctx.fillStyle = p.sky
    ctx.fill()
    ctx.save()
    ctx.clip()
    const photo = ctx.createLinearGradient(90, 400, 990, 900)
    photo.addColorStop(0, p.indigo)
    photo.addColorStop(0.55, p.violet)
    photo.addColorStop(1, p.magenta)
    ctx.fillStyle = photo
    ctx.fillRect(90, 400, 900, 500)
    ctx.restore()
    ctx.strokeStyle = p.gold
    ctx.lineWidth = 3
    ctx.globalAlpha = pickAlpha * 0.8
    ctx.stroke()
    ctx.globalAlpha = pickAlpha
    drawOrb(ctx, p, orb, W / 2, 610, 120, t)
    drawSymbol(ctx, p, reading.sign.symbol, W / 2, 610, 110)
    ctx.fillStyle = goldText(ctx, p, 850, 60)
    ctx.font = `600 60px ${serif}`
    ctx.fillText('Звёзды выбрали', W / 2, 850)

    ctx.fillStyle = p.light
    ctx.font = `600 58px ${serif}`
    const titleLines = wrapText(ctx, pick.title, 820).slice(0, 3)
    titleLines.forEach((line, i) => ctx.fillText(line, W / 2, 1000 + i * 72))
    let y = 1000 + titleLines.length * 72 + 20
    ctx.fillStyle = p.lavender
    ctx.font = `500 46px ${font}`
    ctx.fillText(pick.place, W / 2, y, 820)
    y += 120
    ctx.fillStyle = goldText(ctx, p, y, 64)
    ctx.font = `800 64px ${font}`
    ctx.fillText(pick.estimate, W / 2, y, 820)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

/** The sky scaled to the frame once: every frame then copies it instead of scaling the picture again. */
function paintedSky(p: Palette, sky: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = VIDEO_WIDTH
  canvas.height = VIDEO_HEIGHT
  drawSky(canvas.getContext('2d')!, p, sky)
  return canvas
}

/** Renders the reading's video, about 8 s at 1080×1920. */
export async function renderReadingVideo(
  reading: Reading,
  name: string,
  pick: StarPick,
  type: string,
  {
    onProgress,
    onRestart,
    signal,
  }: { onProgress: (share: number) => void; onRestart: () => void; signal: AbortSignal },
): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = VIDEO_WIDTH
  canvas.height = VIDEO_HEIGHT
  const ctx = canvas.getContext('2d')!
  const [font, serif, orb, sky] = await Promise.all([
    brandFont(),
    serifFont(),
    loadPicture('/images/stars/orb-plain.webp'),
    loadPicture('/images/stars/modal-bg.webp'),
  ])
  const p = readPalette()
  const style = { p, font, serif, site: window.location.host, orb, sky: sky && paintedSky(p, sky) }
  const blob = await recordCanvas(canvas, {
    type,
    durationMs: VIDEO_MS,
    draw: (t) => drawReadingFrame(ctx, reading, name, pick, t, style),
    onProgress,
    onRestart,
    signal,
  })
  return new File([blob], `ostrovok-zvezdy.${extensionOf(type)}`, { type: blob.type || type })
}
