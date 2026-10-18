import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BedDouble, ChevronRight, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Destination } from '@/data/destinations'
import type { NewHotel } from '../../data/hotels'
import { GLOBE_CENTER, viewPlacing, type GlobeView } from '../../lib/globe'
import { appEnv, isProduction } from '../../lib/env'
import { formatPrice } from '../../lib/format'
import { createFrameMeter, type FrameWindow } from './globePerformance'
import { createGlobeRenderer, type GlobeRenderer } from './globeRenderer'
import { createHotelFeed, depthOpacity, pickSpotlightCity, sceneAt, type Scene, type Spotlight } from './globeScene'
import { StatsPanel, type StatsPanelHandle } from './StatsPanel'
import styles from './Hero.module.css'

interface Props {
  markers: Destination[]
  hotels: NewHotel[]
  /** City spotlighted first (and in the server-rendered page). */
  featured: Destination
  selectedId: string | null
  onSelect: (destination: Destination) => void
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
/** Seconds each new hotel stays in the spotlight. */
const SPOTLIGHT_SECONDS = 5
const REDUCED_MOTION_SPOTLIGHT_SECONDS = 8
/** The globe holds still while the page scrolls and this long after: the browser needs the frame budget to paint the page. */
const SCROLL_PAUSE_MS = 150
/** High-refresh screens get every other frame: the slow spin gains nothing from 120 fps. */
const MIN_FRAME_MS = 10
/** Below this speed (degrees per second) the globe is considered standing, so it is not redrawn. */
const MIN_SPEED = 0.001
/** Entrance of a new spotlight: the card fades in, then the routes to its city. */
const SPOTLIGHT_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const CARD_FADE_MS = 700
const ROUTE_FADE_MS = 1000
const ROUTE_DELAY_MS = 200
/** Routes to the first spotlight, matching the reference composition. */
const initialSourceIds = ['london', 'lisbon', 'tbilisi']

export function Hero({ markers, hotels, featured, selectedId, onSelect }: Props) {
  const [feed] = useState(() => createHotelFeed(hotels))
  const [spotlight, setSpotlight] = useState<Spotlight>(() => ({
    destination: featured,
    hotel: feed.next(featured.id)!,
    sources: initialSourceIds.flatMap((id) => markers.find((d) => d.id === id) ?? []),
  }))
  // The initial layout is rendered once; afterwards the animation loop owns all positions.
  const [initialScene] = useState(() => sceneAt(markers, spotlight, GLOBE_CENTER))
  const [spinning, setSpinning] = useState(false)

  const heroRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const globeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pinRefs = useRef(new Map<string, HTMLButtonElement>())
  const routeRefs = useRef<(SVGGElement | null)[]>([])
  const glowRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLButtonElement>(null)
  const statsRef = useRef<StatsPanelHandle>(null)
  const spotlightRef = useRef(spotlight)
  const pausedRef = useRef({ hover: false, focus: false, selected: false })
  const viewRef = useRef({ ...GLOBE_CENTER })
  /** View the globe is turning to, so that the selected pin comes to the middle of the visible globe. */
  const targetRef = useRef<GlobeView | null>(null)

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
    }
    routeRefs.current.forEach((g, i) => {
      const route = scene.routes[i]
      if (!g) return
      if (route) for (const path of g.children) path.setAttribute('d', route.d)
      g.style.opacity = String(route?.opacity ?? 0)
    })
  }, [])

  // A new spotlight is painted before the browser shows it, so the card never flashes at a stale spot.
  useLayoutEffect(() => {
    const changed = spotlightRef.current !== spotlight
    spotlightRef.current = spotlight
    paint(sceneAt(markers, spotlight, viewRef.current))
    // The card and its routes fade in at the new city instead of jumping there (not on the first render:
    // the server-rendered card is already in place). Animations override the per-frame depth opacity
    // only while they run.
    if (!changed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    cardRef.current?.animate({ opacity: [0, 1] }, { duration: CARD_FADE_MS, easing: SPOTLIGHT_EASE })
    for (const group of routeRefs.current)
      for (const path of group?.children ?? [])
        path.animate(
          { opacity: [0, 1] },
          { duration: ROUTE_FADE_MS, delay: ROUTE_DELAY_MS, easing: SPOTLIGHT_EASE, fill: 'backwards' },
        )
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
      const card = cardRef.current!.getBoundingClientRect()
      const picked = pickSpotlightCity(
        markers.filter((d) => feed.has(d.id)),
        points,
        {
          globe: globeRect,
          hero: hero.getBoundingClientRect(),
          avoid: [copyRef.current!.getBoundingClientRect(), hintRef.current!.getBoundingClientRect()],
          card: { left: card.left - hubX, right: card.right - hubX, top: card.top - hubY, bottom: card.bottom - hubY },
        },
        recent,
      )
      if (!picked) return
      recent.unshift(picked.city.id)
      recent.length = Math.min(recent.length, 4)
      setSpotlight({ destination: picked.city, hotel: feed.next(picked.city.id)!, sources: picked.sources })
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

      // Ease in and out of rotation instead of starting or stopping abruptly. A drag pulls the spin
      // towards the pointer's speed; once released, the globe coasts back to its own pace.
      if (drag && dt > 0) {
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
    // The card moves to the selected city, so it never covers the pin.
    if (spotlightRef.current.destination.id !== selected.id && feed.has(selected.id))
      setSpotlight({ destination: selected, hotel: feed.next(selected.id)!, sources: [] })
    const g = globeRef.current!.getBoundingClientRect()
    const h = heroRef.current!.getBoundingClientRect()
    const radius = g.width / 2
    // The card keeps its place relative to the pin (below it on phones, beside it on wide screens);
    // the pair must end just above the form, which overlaps the bottom quarter of the hero.
    const card = cardRef.current!.getBoundingClientRect()
    const hub = sceneAt(markers, spotlightRef.current, viewRef.current).hub
    const hubY = g.top + (hub.y / 100) * g.height
    const formTop = h.bottom - h.height * FORM_OVERLAP
    const x = h.left + h.width / 2
    const y = formTop - Math.max(card.bottom - hubY, 0) - SELECTED_GAP
    const u = (x - g.left - radius) / radius
    const v = (g.top + radius - y) / radius
    // Far north a city cannot reach every spot of the disc: move the spot towards the centre until it can.
    for (const k of [1, 0.75, 0.5, 0.25, 0]) {
      targetRef.current = viewPlacing(selected.lat, selected.lon, u * k, v * k, MAX_TILT)
      if (targetRef.current) break
    }
  }, [markers, feed, selectedId])

  const pause = (key: 'hover' | 'focus', value: boolean) => () => {
    pausedRef.current[key] = value
  }
  const pauseHandlers = {
    onPointerEnter: pause('hover', true),
    onPointerLeave: pause('hover', false),
    onFocus: pause('focus', true),
    onBlur: pause('focus', false),
  }

  const { hotel, destination } = spotlight

  return (
    <section ref={heroRef} className={styles.hero} aria-labelledby='hero-title'>
      <div ref={copyRef} className={styles.copy}>
        <h1 id='hero-title' className={styles.title}>
          Найди свой <span className={styles.titleAccent}>уголок</span>
        </h1>
      </div>

      <p ref={hintRef} className={styles.hint} aria-hidden>
        Вращай глобус — воплощай мечту
      </p>

      <div ref={globeRef} className={styles.globe}>
        <div className={styles.atmosphere} aria-hidden />
        <div className={styles.earth} aria-hidden />
        <canvas ref={canvasRef} className={`${styles.canvas} ${spinning ? styles.canvasShown : ''}`} aria-hidden />
        <div className={styles.rim} aria-hidden />
        <div className={styles.sun} aria-hidden />
        <div ref={glowRef} className={styles.cityGlow} style={positionStyle(initialScene.hub)} aria-hidden />

        <svg className={styles.routes} viewBox='0 0 100 100' preserveAspectRatio='none' aria-hidden>
          {initialScene.routes.map((route, i) => (
            <g
              key={i}
              ref={(el) => {
                routeRefs.current[i] = el
              }}
              className={styles.routeGroup}
              style={{ opacity: route.opacity }}
            >
              {/* Two wide translucent strokes fake the glow: a blur filter would re-run on every frame. */}
              <path className={styles.routeHalo} d={route.d} />
              <path className={styles.routeGlow} d={route.d} />
              <path className={styles.route} d={route.d} />
            </g>
          ))}
        </svg>

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
              type='button'
              className={`${styles.pin} ${isHub ? styles.pinHub : ''}`}
              style={{ ...positionStyle(point), '--o': depthOpacity(point.depth).toFixed(3) } as CSSProperties}
              data-hidden={point.depth <= 0.05 || undefined}
              aria-label={`${d.name}, ${d.country} — выбрать направление`}
              aria-pressed={selectedId === d.id}
              onClick={() => onSelect(d)}
              {...pauseHandlers}
            >
              <PinIcon />
              <span className={styles.pinTooltip} aria-hidden>
                {d.name}
              </span>
            </button>
          )
        })}

        <button
          ref={cardRef}
          type='button'
          className={styles.placeCard}
          style={positionStyle(initialScene.hub)}
          aria-label={`Новый отель ${hotel.name}, ${destination.name}, от ${formatPrice(hotel.priceFrom)} за ночь — выбрать направление`}
          onClick={() => onSelect(destination)}
          {...pauseHandlers}
        >
          {/* Re-keyed per hotel so every new one plays the entrance animation. */}
          <span key={`${hotel.destinationId}/${hotel.name}`} className={styles.placeContent}>
            <span className={styles.placeIcon} aria-hidden>
              <BedDouble />
            </span>
            <span className={styles.placeText}>
              {/* Line height 1.25 and no vertical padding: the picture is sized from the three text lines. */}
              <Badge
                variant='success'
                className='rounded-sm px-1 py-0 text-(length:--badge-size) leading-[1.25] tracking-[0.02em] uppercase'
              >
                Новый отель · {destination.name}
              </Badge>
              <span className={styles.placeName}>{hotel.name}</span>
              <span className={styles.placeMeta}>
                <span className={styles.placeStars} aria-hidden>
                  {Array.from({ length: hotel.stars }, (_, i) => (
                    <Star key={i} fill='currentColor' strokeWidth={0} />
                  ))}
                </span>
                <span className={styles.placePrice}>от {formatPrice(hotel.priceFrom)}/ночь</span>
              </span>
            </span>
            <ChevronRight className={styles.placeChevron} aria-hidden />
          </span>
        </button>
      </div>

      {!isProduction && <StatsPanel ref={statsRef} />}
    </section>
  )
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
    <svg className={styles.pinIcon} viewBox='0 0 24 32' aria-hidden>
      <path
        d='M12 1.2C6.04 1.2 1.2 5.9 1.2 11.7c0 7.6 9.2 17.6 10 18.5a1.1 1.1 0 0 0 1.6 0c.8-.9 10-10.9 10-18.5C22.8 5.9 17.96 1.2 12 1.2Z'
        fill='currentColor'
        style={{ stroke: 'var(--decor-light)' }}
        strokeWidth='1.6'
      />
      <circle cx='12' cy='11.6' r='4.2' style={{ fill: 'var(--decor-light)' }} />
    </svg>
  )
}
