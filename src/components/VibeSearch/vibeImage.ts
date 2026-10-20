import { brandFont, canvasToFile, cssColor, drawBrandFrame, wrapText } from '../../lib/shareMedia'
import type { Vibe } from '../../lib/vibe'

/** A portrait post for social networks. */
export const IMAGE_WIDTH = 1080
export const IMAGE_HEIGHT = 1350

const X = 90
const BAR_WIDTH = IMAGE_WIDTH - 2 * X

type Palette = Record<
  'light' | 'soft' | 'ink' | 'muted' | 'track' | 'calmFrom' | 'calmTo' | 'loudFrom' | 'loudTo',
  string
>

const readPalette = (): Palette => ({
  light: cssColor('--decor-light'),
  soft: cssColor('--secondary'),
  ink: cssColor('--foreground'),
  muted: cssColor('--muted-foreground'),
  track: cssColor('--muted'),
  calmFrom: cssColor('--decor-vibe-calm-from'),
  calmTo: cssColor('--decor-vibe-calm-to'),
  loudFrom: cssColor('--decor-vibe-loud-from'),
  loudTo: cssColor('--decor-vibe-loud-to'),
})

/** The vibe's name and its seven scales between the brand on top and the slogan at the bottom. */
export function drawVibeImage(
  ctx: CanvasRenderingContext2D,
  vibe: Vibe,
  { p, font, site }: { p: Palette; font: string; site: string },
) {
  const bg = ctx.createLinearGradient(0, 0, 0, IMAGE_HEIGHT)
  bg.addColorStop(0, p.light)
  bg.addColorStop(1, p.soft)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT)
  const { top } = drawBrandFrame(ctx, font, site)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillStyle = p.muted
  ctx.font = `600 40px ${font}`
  ctx.fillText('Мой вайб', IMAGE_WIDTH / 2, top + 50)
  const title = ctx.createLinearGradient(X, 0, IMAGE_WIDTH - X, 0)
  title.addColorStop(0, p.calmTo)
  title.addColorStop(1, p.loudFrom)
  ctx.fillStyle = title
  ctx.font = `800 88px ${font}`
  ctx.fillText(vibe.archetype.name, IMAGE_WIDTH / 2, top + 150, BAR_WIDTH)
  ctx.fillStyle = p.ink
  ctx.font = `500 38px ${font}`
  wrapText(ctx, vibe.archetype.description, BAR_WIDTH)
    .slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, IMAGE_WIDTH / 2, top + 215 + i * 48))

  // Seven scales: the left option and its share, the bar, the right share and option.
  vibe.shares.forEach(({ axis, left, right }, i) => {
    const y = top + 330 + i * 78
    ctx.font = `600 30px ${font}`
    ctx.textAlign = 'left'
    ctx.fillStyle = left >= right ? p.ink : p.muted
    ctx.fillText(`${axis.left} · ${left}%`, X, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = right >= left ? p.ink : p.muted
    ctx.fillText(`${right}% · ${axis.right}`, IMAGE_WIDTH - X, y)

    const barY = y + 16
    ctx.fillStyle = p.track
    ctx.beginPath()
    ctx.roundRect(X, barY, BAR_WIDTH, 16, 8)
    ctx.fill()
    const split = (BAR_WIDTH * left) / 100
    if (left > 0) {
      const calm = ctx.createLinearGradient(X, 0, X + split, 0)
      calm.addColorStop(0, p.calmFrom)
      calm.addColorStop(1, p.calmTo)
      ctx.fillStyle = calm
      ctx.beginPath()
      ctx.roundRect(X, barY, split, 16, 8)
      ctx.fill()
    }
    if (right > 0) {
      const loud = ctx.createLinearGradient(X + split, 0, X + BAR_WIDTH, 0)
      loud.addColorStop(0, p.loudFrom)
      loud.addColorStop(1, p.loudTo)
      ctx.fillStyle = loud
      ctx.beginPath()
      ctx.roundRect(X + split, barY, BAR_WIDTH - split, 16, 8)
      ctx.fill()
    }
  })
}

export async function renderVibeImage(vibe: Vibe): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = IMAGE_WIDTH
  canvas.height = IMAGE_HEIGHT
  const ctx = canvas.getContext('2d')!
  const font = await brandFont()
  drawVibeImage(ctx, vibe, { p: readPalette(), font, site: window.location.host })
  return canvasToFile(canvas, 'ostrovok-vibe.png')
}
