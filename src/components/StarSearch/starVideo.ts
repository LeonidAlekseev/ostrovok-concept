import { formatPrice } from '../../lib/format'
import { lowerFirst, type Reading } from '../../lib/horoscope'
import { brandFont, cssColor, drawBrandFrame, extensionOf, recordCanvas, wrapText } from '../../lib/shareMedia'

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

type Palette = Record<'primary' | 'violet' | 'magenta' | 'lime' | 'gold' | 'light' | 'ink' | 'muted' | 'soft', string>

const readPalette = (): Palette => ({
  primary: cssColor('--primary'),
  violet: cssColor('--decor-violet'),
  magenta: cssColor('--decor-magenta'),
  lime: cssColor('--brand'),
  gold: cssColor('--decor-gold'),
  light: cssColor('--decor-light'),
  ink: cssColor('--foreground'),
  muted: cssColor('--muted-foreground'),
  soft: cssColor('--secondary'),
})

/** The magic orb: a swirl of the brand colours under a glass highlight, sparkles around it. */
function drawOrb(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, t: number) {
  ctx.save()
  const glow = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 1.6)
  glow.addColorStop(0, p.violet)
  glow.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.35
  ctx.fillStyle = glow
  ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2)
  ctx.globalAlpha = 1

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  const swirl = ctx.createConicGradient(t / 900, x, y)
  ;[p.primary, p.violet, p.magenta, p.lime, p.primary].forEach((c, i, all) =>
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
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 0.9)
  shine.addColorStop(0, p.light)
  shine.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.7
  ctx.fillStyle = shine
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()

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

/** Paints frame `t` (ms) of the reading's video. */
export function drawReadingFrame(
  ctx: CanvasRenderingContext2D,
  reading: Reading,
  name: string,
  t: number,
  { p, font, site }: { p: Palette; font: string; site: string },
) {
  const W = VIDEO_WIDTH
  const bg = ctx.createLinearGradient(0, 0, 0, VIDEO_HEIGHT)
  bg.addColorStop(0, p.light)
  bg.addColorStop(1, p.soft)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, VIDEO_HEIGHT)
  drawBrandFrame(ctx, font, site)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 1. The orb and the sign.
  const intro = sceneAlpha(t, -FADE_MS, FORECAST_AT)
  if (intro > 0) {
    ctx.globalAlpha = intro
    drawOrb(ctx, p, W / 2, 800, 300, t)
    const reveal = ease((t - 600) / 1400)
    ctx.globalAlpha = intro * reveal
    drawSymbol(ctx, p, reading.sign.symbol, W / 2, 800, 220 * (0.5 + 0.5 * reveal))
    ctx.fillStyle = p.ink
    ctx.font = `800 76px ${font}`
    ctx.fillText(`${name} · ${reading.sign.name}`, W / 2, 1280)
    ctx.fillStyle = p.muted
    ctx.font = `500 46px ${font}`
    ctx.fillText(`Луна: ${reading.moon.sign.name}, ${lowerFirst(reading.moon.phase.name)}`, W / 2, 1360)
  }

  // 2. The forecast.
  const forecast = sceneAlpha(t, FORECAST_AT, HOTEL_AT)
  if (forecast > 0) {
    ctx.globalAlpha = forecast
    drawOrb(ctx, p, W / 2, 470, 130, t)
    drawSymbol(ctx, p, reading.sign.symbol, W / 2, 470, 120)
    ctx.fillStyle = p.ink
    ctx.font = `600 52px ${font}`
    const lines = wrapText(ctx, reading.forecast, 900)
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 720 + i * 72 + (1 - ease((t - FORECAST_AT) / 600)) * 40))
  }

  // 3. The hotel.
  const hotelAlpha = sceneAlpha(t, HOTEL_AT, Infinity)
  if (hotelAlpha > 0) {
    const [hotel] = reading.hotels
    const rise = (1 - ease((t - HOTEL_AT) / 700)) * 60
    ctx.globalAlpha = hotelAlpha
    ctx.save()
    ctx.translate(0, rise)
    ctx.shadowColor = p.violet
    ctx.shadowBlur = 60
    ctx.fillStyle = p.light
    ctx.beginPath()
    ctx.roundRect(90, 420, 900, 940, 48)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.save()
    ctx.clip()
    const photo = ctx.createLinearGradient(90, 420, 990, 900)
    photo.addColorStop(0, p.primary)
    photo.addColorStop(1, p.violet)
    ctx.fillStyle = photo
    ctx.fillRect(90, 420, 900, 480)
    ctx.restore()
    drawSymbol(ctx, p, reading.sign.symbol, W / 2, 620, 200)
    ctx.fillStyle = p.light
    ctx.font = `700 48px ${font}`
    ctx.fillText('Звёзды выбрали', W / 2, 830)

    ctx.fillStyle = p.ink
    ctx.font = `800 64px ${font}`
    const nameLines = wrapText(ctx, hotel.name, 820).slice(0, 2)
    nameLines.forEach((line, i) => ctx.fillText(line, W / 2, 1000 + i * 76))
    let y = 1000 + nameLines.length * 76 + 10
    ctx.fillStyle = p.muted
    ctx.font = `500 46px ${font}`
    ctx.fillText(`${reading.city.name}, ${reading.city.country}`, W / 2, y)
    y += 90
    ctx.fillStyle = p.gold
    ctx.font = `56px ${font}`
    ctx.fillText('★'.repeat(hotel.stars), W / 2, y)
    y += 110
    ctx.fillStyle = p.primary
    ctx.font = `800 80px ${font}`
    ctx.fillText(`от ${formatPrice(hotel.priceFrom)}`, W / 2, y)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

/** Renders the reading's video, about 8 s at 1080×1920. */
export async function renderReadingVideo(
  reading: Reading,
  name: string,
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
  const font = await brandFont()
  const style = { p: readPalette(), font, site: window.location.host }
  const blob = await recordCanvas(canvas, {
    type,
    durationMs: VIDEO_MS,
    draw: (t) => drawReadingFrame(ctx, reading, name, t, style),
    onProgress,
    onRestart,
    signal,
  })
  return new File([blob], `ostrovok-zvezdy.${extensionOf(type)}`, { type: blob.type || type })
}
