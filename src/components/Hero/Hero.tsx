import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { BedDouble, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Destination } from '@/data/destinations'
import type { HotelSummary } from '@/lib/catalog'
import { hotelHref } from '@/lib/search'
import { GLOBE_CENTER, viewPlacing, type GlobeView } from '../../lib/globe'
import { appEnv, isProduction } from '../../lib/env'
import { formatPrice } from '../../lib/format'
import { SLOGAN } from '../../lib/shareMedia'
import { createFrameMeter, type FrameWindow } from './globePerformance'
import { createGlobeRenderer, type GlobeRenderer } from './globeRenderer'
import {
  createHotelFeed,
  depthOpacity,
  pickOther,
  pickSpotlightCity,
  sceneAt,
  type Scene,
  type Spotlight,
} from './globeScene'
import { cardShift, type CardFit } from './cardFit'
import { StatsPanel, type StatsPanelHandle } from './StatsPanel'

interface Props {
  /** The cities with new hotels: a pin each. */
  cities: Destination[]
  /** The new hotels the cards show. */
  hotels: readonly HotelSummary[]
  /** City spotlighted first (and in the server-rendered page). */
  featured: Destination
}

/** Degrees of longitude per second; one turn takes about five minutes. */
const SPIN_SPEED = 1.2
/** How quickly the spin follows a drag, and how quickly it settles back afterwards (per second). */
const DRAG_FOLLOW_RATE = 8
const SETTLE_RATE = 1.5
/** Upper bound for a flick, in degrees per second. */
const MAX_DRAG_SPEED = 400
/** A vertical drag tilts the globe up to this latitude either way; the tilt stays after release. */
const MAX_TILT = 85
/** How quickly the globe turns a selected pin into place (per second). */
const CENTER_RATE = 3
/** Share of the hero's height covered by the search form, and the gap kept above it, px. */
const FORM_OVERLAP = 0.24
const SELECTED_GAP = 16
/** Seconds each hotel stays in the spotlight. */
const SPOTLIGHT_SECONDS = 5
const REDUCED_MOTION_SPOTLIGHT_SECONDS = 8
/** The globe holds still while the page scrolls and this long after: the browser needs the frame budget to paint the page. */
const SCROLL_PAUSE_MS = 150
/** High-refresh screens get every other frame: the slow spin gains nothing from 120 fps. */
const MIN_FRAME_MS = 10
/** Below this speed (degrees per second) the globe is considered standing, so it is not redrawn. */
const MIN_SPEED = 0.001
/** Entrance of a new spotlight: the card fades in. */
const SPOTLIGHT_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const CARD_FADE_MS = 700

const hero = [
  // The sphere is much larger than the viewport: it rises from the lower right behind the title.
  // Offsets include the transparent header laid over the top of the hero.
  '[--globe-size:clamp(540px,144vw,640px)] [--globe-top:calc(var(--header-height)+clamp(24px,8vw,40px))] [--globe-x:88%]',
  'md:[--globe-size:clamp(760px,76vw,980px)] md:[--globe-top:calc(var(--header-height)+32px)] md:[--globe-x:64%]',
  'relative isolate h-[calc(var(--globe-top)+var(--globe-size)*1.0133)] overflow-hidden text-brand-foreground md:h-[calc(var(--globe-top)+var(--globe-size)*0.8267)]',
  'bg-brand bg-[radial-gradient(ellipse_60%_45%_at_85%_30%,color-mix(in_srgb,var(--decor-glow)_75%,transparent),transparent_70%)]',
  // A long press on the globe must not start selecting the title (iOS) or open the callout.
  'select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]',
  // Fade the bottom of the scene into the page behind the search panel, lightly at first: the globe shows through
  // the top of its glass.
  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-3 after:h-[30%] after:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_0%,transparent)_0%,color-mix(in_srgb,var(--decor-haze)_45%,transparent)_75%,var(--background)_100%)] after:content-['']",
].join(' ')
const earth =
  // The ocean, lit from the upper right like the land dots on the canvas; it is also the whole globe until they load.
  'relative size-full rounded-full bg-[radial-gradient(circle_at_68%_28%,var(--decor-ocean-light),var(--decor-ocean)_42%,var(--decor-ocean-deep)_95%)]'
const earthShade = [
  // Over the land and the ocean alike: a highlight on the sunlit side, the night side darkens towards the limb,
  // and the atmosphere lights the rim from inside.
  'pointer-events-none absolute inset-0 rounded-full',
  'bg-[radial-gradient(circle_at_68%_28%,color-mix(in_srgb,var(--decor-light)_30%,transparent),transparent_28%,transparent_45%,color-mix(in_srgb,var(--decor-ocean-deep)_55%,transparent)_80%)]',
  'shadow-[inset_0_0_28px_6px_color-mix(in_srgb,var(--decor-atmosphere)_75%,transparent)]',
].join(' ')
const atmosphere =
  'absolute inset-0 rounded-full shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_70%,transparent),0_0_26px_8px_color-mix(in_srgb,var(--decor-atmosphere)_85%,transparent),0_0_90px_28px_color-mix(in_srgb,var(--decor-atmosphere)_55%,transparent)]'
const sun = [
  // The glare sits exactly on the limb, at this angle from the globe's centre (clockwise from 3 o'clock).
  // The globe overflows a phone's screen sideways: there the glare stays on the visible part of the limb.
  '[--sun-angle:-50deg] max-md:[--sun-angle:-112deg]',
  'pointer-events-none absolute top-[calc(50%_+_50%_*_sin(var(--sun-angle)))] left-[calc(50%_+_50%_*_cos(var(--sun-angle)))] aspect-square w-[26%] -translate-1/2 mix-blend-screen',
  'bg-[radial-gradient(circle,color-mix(in_srgb,var(--decor-light)_95%,transparent)_0_3%,color-mix(in_srgb,var(--decor-glow-soft)_60%,transparent)_9%,color-mix(in_srgb,var(--decor-glow)_20%,transparent)_30%,transparent_62%)]',
].join(' ')
// Markers are placed by --x/--y, percent of the globe box: --unit is 1% of it.
const cityGlow =
  'pointer-events-none absolute top-0 left-0 aspect-[1.3] w-[16%] translate-x-[calc(var(--x)_*_var(--unit)_-_50%)] translate-y-[calc(var(--y)_*_var(--unit)_-_50%)] bg-[radial-gradient(ellipse,color-mix(in_srgb,var(--decor-light)_70%,transparent)_0%,color-mix(in_srgb,var(--decor-glow-soft)_30%,transparent)_35%,transparent_70%)] opacity-[var(--o,1)] mix-blend-screen'
const pin = [
  'group absolute top-0 left-0 touch-none rounded-[50%_50%_50%_50%/40%_40%_60%_60%] text-primary opacity-[var(--o,1)] will-change-[translate,scale] data-hidden:invisible',
  'translate-x-[calc(var(--x)_*_var(--unit)_-_50%)] translate-y-[calc(var(--y)_*_var(--unit)_-_100%)]',
  // The translate is rewritten every frame; the scale eases on its own.
  'transition-[scale,width,height,color] duration-[600ms,700ms,700ms,400ms] ease-[cubic-bezier(0.22,1,0.36,1),cubic-bezier(0.22,1,0.36,1),cubic-bezier(0.22,1,0.36,1),ease]',
  'hover:scale-115 focus-visible:scale-115',
  // The selected pin grows and darkens; the globe turns it to the middle and stops.
  'aria-pressed:z-3 aria-pressed:scale-145 aria-pressed:text-(--decor-pin-selected)',
  "before:absolute before:left-1/2 before:-translate-x-1/2 before:content-['']",
].join(' ')
const pinShadow =
  'before:-bottom-1 before:h-[7px] before:w-4 before:bg-[radial-gradient(ellipse,color-mix(in_srgb,var(--decor-light)_95%,transparent),transparent_70%)]'
const hubShadow =
  'before:-bottom-2 before:h-4 before:w-[42px] before:animate-hub-pulse before:bg-[radial-gradient(ellipse,color-mix(in_srgb,var(--decor-light)_95%,transparent),color-mix(in_srgb,var(--decor-glow-soft)_45%,transparent)_45%,transparent_72%)] motion-reduce:before:animate-none'
const pinTooltip =
  'pointer-events-none absolute bottom-[calc(100%_+_6px)] left-1/2 -translate-x-1/2 translate-y-1 rounded-sm bg-card px-2 py-1 text-xs/[normal] font-semibold whitespace-nowrap text-foreground opacity-0 shadow-(--shadow-soft) transition-[opacity,translate] duration-150 ease-[ease]'
// The hub pin carries the featured card, so it shows no tooltip.
const pinTooltipShown =
  'group-focus-visible:translate-y-0 group-focus-visible:opacity-100 [.group:hover_&]:translate-y-0 [.group:hover_&]:opacity-100'
const placeCard = [
  '[--card-dx:22px] [--card-dy:calc(-100%_-_12px)] [--card-lift:0px]',
  // Not enough room to the right of the pin on phones, and the title is above it: hang the card below.
  'max-md:[--card-dx:-50%] max-md:[--card-dy:12px]',
  // Inset of the picture, the same on every side; its size equals the text block's height.
  '[--card-pad:clamp(5px,1.4vw,7px)] [--badge-size:clamp(9px,2.5vw,12px)] [--name-size:clamp(13px,3.5vw,17px)] [--meta-size:clamp(10px,2.75vw,13px)] [--text-gap:2px]',
  // The search panel under the globe (SearchPanel: the glass between the page margins), marked
  // [data-search-panel]. On phones the card is no wider than it (here) and is kept inside it (cardShift).
  'absolute top-0 left-0 z-5 w-max max-w-[min(26rem,calc(100vw-2*var(--page-x)))] md:max-w-[min(26rem,calc(50vw-40px))] rounded-[clamp(10px,3vw,14px)] border-0 bg-card py-(--card-pad) pr-[calc(var(--card-pad)_+_4px)] pl-(--card-pad) text-left text-foreground',
  'translate-x-[calc(var(--x)_*_var(--unit)_+_var(--card-dx)_+_var(--card-shift,0px))] translate-y-[calc(var(--y)_*_var(--unit)_+_var(--card-dy)_-_var(--card-lift))] touch-none opacity-[var(--o,1)] will-change-transform',
  'shadow-[0_14px_34px_color-mix(in_srgb,var(--decor-hotel-shadow)_25%,transparent)] transition-shadow duration-200 ease-[ease]',
  'hover:shadow-[0_18px_40px_color-mix(in_srgb,var(--decor-hotel-shadow)_32%,transparent)] hover:[--card-lift:4px]',
].join(' ')
const placeIcon =
  // Concentric with the card's corner.
  'grid aspect-square w-[calc(1.25_*_(var(--badge-size)_+_var(--name-size)_+_var(--meta-size))_+_2_*_var(--text-gap))] flex-none place-items-center rounded-[calc(clamp(10px,3vw,14px)_-_var(--card-pad)_+_2px)] bg-[linear-gradient(135deg,var(--decor-hotel-from),var(--decor-hotel-to))] text-primary-foreground [&_svg]:h-auto [&_svg]:w-[48%]'

export function Hero({ cities: markers, hotels, featured }: Props) {
  const [feed] = useState(() => createHotelFeed(hotels))
  const [spotlight, setSpotlight] = useState<Spotlight>(() => ({
    destination: featured,
    hotel: feed.has(featured.id) ? feed.next(featured.id)! : null,
  }))
  /** The chosen pin: the globe turns it to the middle and its card shows one of the city's hotels. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The initial layout is rendered once; afterwards the animation loop owns all positions.
  const [initialScene] = useState(() => sceneAt(markers, spotlight, GLOBE_CENTER))
  const [spinning, setSpinning] = useState(false)

  const heroRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pinRefs = useRef(new Map<string, HTMLButtonElement>())
  const glowRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<StatsPanelHandle>(null)
  const fitRef = useRef<CardFit | null>(null)
  const spotlightRef = useRef(spotlight)
  const pausedRef = useRef({ hover: false, focus: false, selected: false })
  const viewRef = useRef({ ...GLOBE_CENTER })
  /** View the globe is turning to, so that the selected pin comes to the middle of the visible globe. */
  const targetRef = useRef<GlobeView | null>(null)
  /** The hotel each city showed last, so that the next opening of its pin shows another one. */
  const shownRef = useRef(new Map<string, string>())

  /** Writes the current scene straight to the DOM, bypassing React on every frame. */
  const paint = useCallback((scene: Scene) => {
    for (const [id, el] of pinRefs.current) {
      const p = scene.points.get(id)!
      setPosition(el, p.x, p.y)
      el.style.setProperty('--o', String(depthOpacity(p.depth)))
      el.toggleAttribute('data-hidden', p.depth <= 0.05)
    }
    const hubOpacity = String(depthOpacity(scene.hub.depth))
    for (const el of [glowRef.current, cardRef.current]) {
      if (!el) continue
      setPosition(el, scene.hub.x, scene.hub.y)
      el.style.setProperty('--o', hubOpacity)
      if (el === cardRef.current) el.style.setProperty('--card-shift', `${cardShift(fitRef.current, scene.hub.x)}px`)
    }
  }, [])

  // Measures what keeps the card inside the search panel on phones; measured again when any of them resizes.
  useLayoutEffect(() => {
    const globe = globeRef.current
    const card = cardRef.current
    const win = document.querySelector('[data-search-panel]')
    if (!globe || !card || !win) return
    const measure = () => {
      const g = globe.getBoundingClientRect()
      const w = win.getBoundingClientRect()
      fitRef.current = {
        globeLeft: g.left,
        globeWidth: g.width,
        winLeft: w.left,
        winRight: w.right,
        cardWidth: card.getBoundingClientRect().width,
        phone: !window.matchMedia('(min-width: 768px)').matches,
      }
      card.style.setProperty(
        '--card-shift',
        `${cardShift(fitRef.current, Number(card.style.getPropertyValue('--x')))}px`,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of [globe, card, win]) observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [spotlight.hotel])

  // A new spotlight is painted before the browser shows it, so the card never flashes at a stale spot.
  useLayoutEffect(() => {
    const changed = spotlightRef.current !== spotlight
    spotlightRef.current = spotlight
    if (spotlight.hotel) shownRef.current.set(spotlight.destination.id, spotlight.hotel.id)
    paint(sceneAt(markers, spotlight, viewRef.current))
    // The card fades in at the new city instead of jumping there (not on the first render: the server-rendered
    // card is already in place). The animation overrides the per-frame depth opacity only while it runs.
    if (!changed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    cardRef.current?.animate({ opacity: [0, 1] }, { duration: CARD_FADE_MS, easing: SPOTLIGHT_EASE })
  }, [markers, spotlight, paint])

  useEffect(() => {
    const canvas = canvasRef.current!
    const globe = globeRef.current!
    const hero = heroRef.current!
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const renderer = createGlobeRenderer(canvas, '/data/globe.json')
    if (!renderer) statsRef.current?.show('no canvas', 'Canvas 2D unavailable: bare sphere')
    const meter = createFrameMeter((frames) => {
      if (renderer) statsRef.current?.show(`${Math.round(frames.fps)} fps`, describeStats(frames, renderer))
    })
    let ready = false
    let shown = false
    renderer?.ready.then(
      () => {
        ready = true
      },
      (error: unknown) => console.error('Globe geometry failed to load:', error),
    )

    const recent: string[] = [spotlightRef.current.destination.id]
    let speed = 0
    // Pointer travel since the last frame while the globe is being dragged.
    let drag: { pointerId: number; lastX: number; lastY: number; dx: number; dy: number } | null = null
    let elapsed = 0
    let last = performance.now()
    let frame = 0
    let lastScroll = -Infinity
    const onScroll = () => {
      lastScroll = performance.now()
    }

    const nextSpotlight = (points: Scene['points']) => {
      const globeRect = globe.getBoundingClientRect()
      const hub = points.get(spotlightRef.current.destination.id)!
      const hubX = globeRect.left + (hub.x / 100) * globeRect.width
      const hubY = globeRect.top + (hub.y / 100) * globeRect.height
      const card = cardRef.current?.getBoundingClientRect()
      if (!card) return
      const picked = pickSpotlightCity(
        markers.filter((d) => feed.has(d.id)),
        points,
        {
          globe: globeRect,
          hero: hero.getBoundingClientRect(),
          avoid: [copyRef.current!.getBoundingClientRect()],
          card: { left: card.left - hubX, right: card.right - hubX, top: card.top - hubY, bottom: card.bottom - hubY },
        },
        recent,
      )
      if (!picked) return
      recent.unshift(picked.id)
      recent.length = Math.min(recent.length, 4)
      setSpotlight({ destination: picked, hotel: feed.next(picked.id)! })
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < MIN_FRAME_MS) return
      if (now - lastScroll < SCROLL_PAUSE_MS) {
        last = now
        return
      }
      const started = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const paused = pausedRef.current.hover || pausedRef.current.focus || pausedRef.current.selected
      const canSpin = ready && !reducedMotion.matches
      const view = viewRef.current

      if (drag && dt > 0) {
        // Ease in and out of rotation instead of starting or stopping abruptly. A drag pulls the spin
        // towards the pointer's speed; once released, the globe coasts back to its own pace.
        // Near the centre one radius of pointer travel turns the globe by one radian.
        const radius = globe.clientWidth / 2
        const dragSpeed = (drag.dx / dt / radius) * (180 / Math.PI)
        // The tilt follows the pointer directly and keeps the new angle; the spin goes on around the tilted axis.
        view.lat = Math.min(Math.max(view.lat + (drag.dy / radius) * (180 / Math.PI), -MAX_TILT), MAX_TILT)
        drag.dx = drag.dy = 0
        const target = Math.min(Math.max(dragSpeed, -MAX_DRAG_SPEED), MAX_DRAG_SPEED)
        speed += (target - speed) * Math.min(dt * DRAG_FOLLOW_RATE, 1)
      } else {
        const targetSpeed = canSpin && !paused ? SPIN_SPEED : 0
        speed += (targetSpeed - speed) * Math.min(dt * SETTLE_RATE, 1)
        if (Math.abs(speed) < MIN_SPEED) speed = 0
      }
      view.lon -= speed * dt
      const target = targetRef.current
      if (target && !drag) {
        const k = reducedMotion.matches ? 1 : Math.min(dt * CENTER_RATE, 1)
        const dLat = target.lat - view.lat
        const dLon = ((((target.lon - view.lon) % 360) + 540) % 360) - 180
        view.lat += dLat * k
        view.lon += dLon * k
        if (Math.abs(dLat) < 0.01 && Math.abs(dLon) < 0.01) targetRef.current = null
      }
      const period = reducedMotion.matches ? REDUCED_MOTION_SPOTLIGHT_SECONDS : SPOTLIGHT_SECONDS
      if (!paused) elapsed += dt
      const scene = sceneAt(markers, spotlightRef.current, view)

      let drew = false
      if (ready) {
        const globeRect = globe.getBoundingClientRect()
        drew = renderer!.draw({
          view,
          size: globeRect.width,
          visibleFraction: (hero.getBoundingClientRect().bottom - globeRect.top) / globeRect.height,
          // Full device resolution keeps the thin lines and dots crisp.
          pixelRatio: window.devicePixelRatio || 1,
          dt: reducedMotion.matches ? 0 : dt,
        })
        if (!shown) {
          shown = true
          setSpinning(true)
        }
      }
      paint(scene)
      if (elapsed >= period) {
        elapsed = 0
        nextSpotlight(scene.points)
      }
      if (ready) meter.frame(now, performance.now() - started, drew)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!ready || drag || e.button !== 0) return
      drag = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, dx: 0, dy: 0 }
      // A drag takes over from turning to the selected pin.
      targetRef.current = null
      canvas.setPointerCapture(e.pointerId)
      canvas.toggleAttribute('data-dragging', true)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drag?.pointerId) return
      drag.dx += e.clientX - drag.lastX
      drag.dy += e.clientY - drag.lastY
      drag.lastX = e.clientX
      drag.lastY = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag?.pointerId) return
      drag = null
      canvas.toggleAttribute('data-dragging', false)
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // Animate only while the hero is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      if (entry.isIntersecting) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    })
    observer.observe(hero)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      renderer?.dispose()
    }
  }, [markers, feed, paint])

  // A selected pin stops the spin and is brought to the middle of the screen, just above the search form.
  useEffect(() => {
    const selected = markers.find((d) => d.id === selectedId)
    pausedRef.current.selected = selected !== undefined
    if (!selected) return
    // Measured once the chosen city's card is painted (`spotlight` in the deps).
    targetRef.current = viewAboveForm(selected, heroRef.current!, globeRef.current!, cardRef.current, () =>
      sceneAt(markers, spotlightRef.current, viewRef.current),
    )
  }, [markers, feed, selectedId, spotlight])

  /** Opens the city's pin with a random new hotel of the city, another than it showed last. */
  const openHotel = (city: Destination) => {
    setSelectedId(city.id)
    // The card moves to the city, so it never covers the pin.
    setSpotlight({ destination: city, hotel: pickOther(feed.all(city.id), shownRef.current.get(city.id)) ?? null })
  }

  /** A pin toggles its choice. */
  const choosePin = (city: Destination) => {
    if (selectedId === city.id) return setSelectedId(null)
    openHotel(city)
  }

  const pause = (key: 'hover' | 'focus', value: boolean) => () => {
    pausedRef.current[key] = value
  }
  const pauseHandlers = {
    onPointerEnter: pause('hover', true),
    onPointerLeave: pause('hover', false),
    onFocus: pause('focus', true),
    onBlur: pause('focus', false),
  }

  const { destination, hotel } = spotlight

  return (
    <section ref={heroRef} className={hero} aria-labelledby="hero-title">
      <div
        ref={copyRef}
        className="pointer-events-none relative z-4 w-fit pt-[calc(var(--header-height)+clamp(18px,5vw,48px))] pr-(--page-x) pl-[calc(var(--page-x)+8px)] md:ml-[max(0px,(100%-var(--page-max))/2)] md:pt-[calc(var(--header-height)+clamp(56px,8vw,96px))]"
      >
        <h1 id="hero-title" className="text-(length:--text-display) leading-[1.02] font-extrabold tracking-[-0.035em]">
          {SLOGAN.slice(0, SLOGAN.lastIndexOf(' '))}{' '}
          <span className="block text-primary">{SLOGAN.slice(SLOGAN.lastIndexOf(' ') + 1)}</span>
        </h1>
      </div>

      {/* No z-index or transform: the globe makes no stacking context of its own, so the hotel card can rise
          above the title while the pins stay under the faded bottom. No container query units for --unit: Safari
          turns a query container into its own stacking layer, trapping the hotel card under the title. */}
      <div
        ref={globeRef}
        className="absolute top-(--globe-top) left-[calc(var(--globe-x)_-_var(--globe-size)/2)] aspect-square w-(--globe-size) [--unit:calc(var(--globe-size)/100)]"
      >
        <div className={atmosphere} aria-hidden />
        <div className={earth} aria-hidden />
        {/* Only the disc itself can be grabbed; on it, swipes in any direction turn the globe. */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 size-full touch-none transition-opacity duration-600 ease-[ease] [clip-path:circle(50%)] data-dragging:cursor-grabbing ${spinning ? 'cursor-grab opacity-100' : 'opacity-0'}`}
          aria-hidden
        />
        <div className={earthShade} aria-hidden />
        <div className={sun} aria-hidden />
        <div ref={glowRef} className={cityGlow} style={positionStyle(initialScene.hub)} aria-hidden />

        {markers.map((d) => {
          const isHub = d.id === destination.id
          const point = initialScene.points.get(d.id)!
          return (
            <button
              key={d.id}
              ref={(el) => {
                if (el) pinRefs.current.set(d.id, el)
                else pinRefs.current.delete(d.id)
              }}
              type="button"
              className={`${pin} ${
                isHub
                  ? `${hubShadow} z-3 h-10 w-[30px] md:h-[58px] md:w-11`
                  : `${pinShadow} z-2 h-6 w-[18px] md:h-[35px] md:w-[26px]`
              }`}
              style={{ ...positionStyle(point), '--o': depthOpacity(point.depth).toFixed(3) } as CSSProperties}
              data-hidden={point.depth <= 0.05 || undefined}
              aria-label={`${d.name}, ${d.country} — отели`}
              aria-pressed={selectedId === d.id}
              onClick={() => choosePin(d)}
              {...pauseHandlers}
            >
              <PinIcon />
              <span className={`${pinTooltip} ${isHub ? '' : pinTooltipShown}`} aria-hidden>
                {d.name}
              </span>
            </button>
          )
        })}

        {hotel && (
          <div ref={cardRef} className={placeCard} style={positionStyle(initialScene.hub)} {...pauseHandlers}>
            {/* Re-keyed per hotel so every new one plays the entrance animation. */}
            <div
              key={`${destination.id}/${hotel.id}`}
              className="flex animate-in items-center gap-[clamp(7px,2vw,12px)] animation-duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] fade-in zoom-in-97 slide-in-from-bottom-2 motion-reduce:animate-none"
            >
              <span className={placeIcon} aria-hidden>
                <BedDouble />
              </span>
              <div className="flex min-w-0 flex-col gap-(--text-gap) leading-[1.25]">
                {/* Line height 1.25 and no vertical padding: the picture is sized from the three text lines. */}
                <Badge
                  variant="success"
                  className="self-start rounded-sm px-1 py-0 text-(length:--badge-size) leading-[1.25] tracking-[0.02em] uppercase"
                >
                  Новый отель · {destination.name}
                </Badge>
                {/* The link covers the whole card. */}
                <Link
                  href={hotelHref(hotel.id)}
                  className="flex min-w-0 flex-col rounded-sm after:absolute after:inset-0 after:content-['']"
                >
                  <span className="truncate text-(length:--name-size) font-[650]">{hotel.name}</span>
                  <span className="truncate text-(length:--meta-size) text-muted-foreground">
                    {destination.name} · от {formatPrice(hotel.priceFrom)} за ночь
                  </span>
                </Link>
              </div>
              <ChevronRight
                className="ml-[clamp(0px,1vw,14px)] w-[clamp(14px,3.8vw,18px)] flex-none text-muted-foreground"
                aria-hidden
              />
            </div>
          </div>
        )}
      </div>

      {!isProduction && <StatsPanel ref={statsRef} />}
    </section>
  )
}

/**
 * The view that brings `city` to the middle of the hero just above the search form, its open card included;
 * `scene` gives the current position of the hub, whose card is measured.
 */
function viewAboveForm(
  city: Destination,
  hero: HTMLElement,
  globe: HTMLElement,
  card: HTMLElement | null,
  scene: () => Scene,
): GlobeView | null {
  const g = globe.getBoundingClientRect()
  const h = hero.getBoundingClientRect()
  const radius = g.width / 2
  // The card keeps its place relative to the pin (below it on phones, beside it on wide screens);
  // the pair must end just above the form, which overlaps the bottom quarter of the hero.
  const cardBottom = card?.getBoundingClientRect().bottom ?? 0
  const hubY = g.top + (scene().hub.y / 100) * g.height
  const formTop = h.bottom - h.height * FORM_OVERLAP
  const x = h.left + h.width / 2
  const y = formTop - Math.max(cardBottom - hubY, 0) - SELECTED_GAP
  const u = (x - g.left - radius) / radius
  const v = (g.top + radius - y) / radius
  // Far north a city cannot reach every spot of the disc: move the spot towards the centre until it can.
  for (const k of [1, 0.75, 0.5, 0.25, 0]) {
    const view = viewPlacing(city.lat, city.lon, u * k, v * k, MAX_TILT)
    if (view) return view
  }
  return null
}

/**
 * Globe coordinates are percent of the globe box; CSS turns them into pixels.
 * Rounded so the server and the browser, whose trigonometry differs in the last digit, render the same markup.
 */
const positionStyle = (p: { x: number; y: number }) =>
  ({ '--x': p.x.toFixed(3), '--y': p.y.toFixed(3) }) as CSSProperties

function setPosition(el: HTMLElement | SVGElement, x: number, y: number) {
  el.style.setProperty('--x', String(x))
  el.style.setProperty('--y', String(y))
}

function describeStats(frames: FrameWindow, renderer: GlobeRenderer) {
  const { geometry, canvas } = renderer.describe()
  const nav = navigator as Navigator & { deviceMemory?: number }
  return [
    `${Math.round(frames.fps)} fps · worst ${frames.worstMs.toFixed(1)} ms · js ${frames.cpuMs.toFixed(2)} ms`,
    `globe ${Math.round(frames.draws)} draws/s · ${canvas} @${window.devicePixelRatio}x`,
    geometry,
    `dpr ${window.devicePixelRatio} · ${nav.hardwareConcurrency} cores · ${nav.deviceMemory ?? '?'} GB`,
    `env ${appEnv}`,
  ].join('\n')
}

function PinIcon() {
  return (
    <svg
      className="relative block size-full drop-shadow-[0_0_4px_color-mix(in_srgb,var(--decor-light)_90%,transparent)]"
      viewBox="0 0 24 32"
      aria-hidden
    >
      <path
        d="M12 1.2C6.04 1.2 1.2 5.9 1.2 11.7c0 7.6 9.2 17.6 10 18.5a1.1 1.1 0 0 0 1.6 0c.8-.9 10-10.9 10-18.5C22.8 5.9 17.96 1.2 12 1.2Z"
        fill="currentColor"
        style={{ stroke: 'var(--decor-light)' }}
        strokeWidth="1.6"
      />
      <circle cx="12" cy="11.6" r="4.2" style={{ fill: 'var(--decor-light)' }} />
    </svg>
  )
}
