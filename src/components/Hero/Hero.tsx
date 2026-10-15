import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BedDouble, ChevronRight, Plane, Star } from 'lucide-react'
import type { Destination } from '../../data/destinations'
import type { NewHotel } from '../../data/hotels'
import { GLOBE_CENTER } from '../../lib/globe'
import { formatPrice } from '../../lib/format'
import { createGlobeRenderer } from './globeRenderer'
import { createHotelFeed, depthOpacity, pickSpotlightCity, sceneAt, type Scene, type Spotlight } from './globeScene'
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
/** Seconds each new hotel stays in the spotlight. */
const SPOTLIGHT_SECONDS = 5
const REDUCED_MOTION_SPOTLIGHT_SECONDS = 8
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
  const [initialScene] = useState(() => sceneAt(markers, spotlight, GLOBE_CENTER.lon, 0.42))
  const [spinning, setSpinning] = useState(false)

  const heroRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pinRefs = useRef(new Map<string, HTMLButtonElement>())
  const routeRefs = useRef<(SVGGElement | null)[]>([])
  const planeRef = useRef<SVGSVGElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLButtonElement>(null)
  const spotlightRef = useRef(spotlight)
  const pausedRef = useRef({ hover: false, focus: false })
  const sceneRef = useRef({ centerLon: GLOBE_CENTER.lon, flight: 0.42 })

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
    const plane = planeRef.current
    if (plane) {
      setPosition(plane, scene.plane.x, scene.plane.y)
      plane.style.setProperty('--angle', `${scene.plane.angle + 45}deg`)
      plane.style.setProperty('--o', String(scene.plane.opacity))
    }
  }, [])

  // A new spotlight is painted before the browser shows it, so the card never flashes at a stale spot.
  useLayoutEffect(() => {
    spotlightRef.current = spotlight
    const { centerLon, flight } = sceneRef.current
    paint(sceneAt(markers, spotlight, centerLon, flight))
  }, [markers, spotlight, paint])

  useEffect(() => {
    const canvas = canvasRef.current!
    const globe = globeRef.current!
    const hero = heroRef.current!
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const renderer = createGlobeRenderer(canvas, {
      small: '/images/earth-texture-2048.webp',
      large: '/images/earth-texture-3600.webp',
    })
    let glReady = false
    let shown = false
    renderer?.ready.then(
      () => {
        glReady = true
      },
      (error: unknown) => console.error('Globe texture failed to load:', error),
    )

    const recent: string[] = [spotlightRef.current.destination.id]
    let speed = 0
    let elapsed = 0
    let last = performance.now()
    let frame = 0

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
          titleBottom: copyRef.current!.getBoundingClientRect().bottom,
          card: { left: card.left - hubX, right: card.right - hubX, top: card.top - hubY },
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
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const paused = pausedRef.current.hover || pausedRef.current.focus
      const canSpin = glReady && !reducedMotion.matches

      // Ease in and out of rotation instead of starting or stopping abruptly.
      const targetSpeed = canSpin && !paused ? SPIN_SPEED : 0
      speed += (targetSpeed - speed) * Math.min(dt * 2, 1)
      const state = sceneRef.current
      state.centerLon -= speed * dt
      if (glReady) {
        const globeRect = globe.getBoundingClientRect()
        const visible = (hero.getBoundingClientRect().bottom - globeRect.top) / globeRect.height
        renderer!.draw(state.centerLon, globeRect.width, visible)
        if (!shown) {
          shown = true
          setSpinning(true)
        }
      }

      const period = reducedMotion.matches ? REDUCED_MOTION_SPOTLIGHT_SECONDS : SPOTLIGHT_SECONDS
      if (!paused) elapsed += dt
      state.flight = reducedMotion.matches ? 0.42 : easeInOut(Math.min(elapsed / (period * 0.8), 1))
      const scene = sceneAt(markers, spotlightRef.current, state.centerLon, state.flight)
      paint(scene)
      if (elapsed >= period) {
        elapsed = 0
        state.flight = 0
        nextSpotlight(scene.points)
      }
    }

    // Animate only while the hero is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      if (entry.isIntersecting) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    })
    observer.observe(hero)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      renderer?.dispose()
    }
  }, [markers, feed, paint])

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
    <section ref={heroRef} className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.sky} aria-hidden>
        <span className={styles.sparkle} style={{ left: '6%', top: '14%' }} />
        <span className={styles.sparkle} style={{ left: '93%', top: '9%' }} />
        <span className={styles.sparkle} style={{ left: '84%', top: '32%' }} />
        <span className={`${styles.sparkle} ${styles.sparkleSmall}`} style={{ left: '18%', top: '36%' }} />
      </div>

      <div ref={copyRef} className={styles.copy}>
        <h1 id="hero-title" className={styles.title}>
          Мир ближе, чем кажется
        </h1>
        <p className={styles.subtitle}>Найдите место для следующего путешествия</p>
      </div>

      <div ref={globeRef} className={styles.globe}>
        <div className={styles.atmosphere} aria-hidden />
        <img
          className={`${styles.earth} ${spinning ? styles.earthHidden : ''}`}
          src="/images/earth-europe-1200.webp"
          srcSet="/images/earth-europe-1200.webp 1200w, /images/earth-europe-2000.webp 2000w"
          sizes="(min-width: 768px) 1100px, 175vw"
          alt="Земля из космоса"
          width={1200}
          height={1200}
          fetchPriority="high"
          onError={(e) => e.currentTarget.classList.add(styles.earthFailed)}
        />
        <canvas ref={canvasRef} className={`${styles.canvas} ${spinning ? styles.canvasShown : ''}`} aria-hidden />
        <div className={styles.rim} aria-hidden />
        <div className={styles.sun} aria-hidden />
        <div ref={glowRef} className={styles.cityGlow} style={positionStyle(initialScene.hub)} aria-hidden />

        <svg className={styles.routes} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          {initialScene.routes.map((route, i) => (
            <g
              key={i}
              ref={(el) => {
                routeRefs.current[i] = el
              }}
              className={styles.routeGroup}
              style={{ opacity: route.opacity }}
            >
              <path className={styles.routeGlow} d={route.d} filter="url(#route-glow)" />
              <path className={styles.route} d={route.d} pathLength={100} />
            </g>
          ))}
        </svg>

        <Plane
          ref={planeRef}
          className={styles.plane}
          style={
            {
              ...positionStyle(initialScene.plane),
              '--angle': `${initialScene.plane.angle + 45}deg`,
            } as CSSProperties
          }
          size={26}
          fill="currentColor"
          strokeWidth={1}
          aria-hidden
        />

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
              className={`${styles.pin} ${isHub ? styles.pinHub : ''}`}
              style={{ ...positionStyle(point), '--o': depthOpacity(point.depth) } as CSSProperties}
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
          type="button"
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
              <span className={styles.placeBadge}>Новый отель · {destination.name}</span>
              <span className={styles.placeName}>{hotel.name}</span>
              <span className={styles.placeMeta}>
                <span className={styles.placeStars} aria-hidden>
                  {Array.from({ length: hotel.stars }, (_, i) => (
                    <Star key={i} fill="currentColor" strokeWidth={0} />
                  ))}
                </span>
                <span className={styles.placePrice}>от {formatPrice(hotel.priceFrom)}/ночь</span>
              </span>
            </span>
            <ChevronRight className={styles.placeChevron} aria-hidden />
          </span>
        </button>
      </div>
    </section>
  )
}

/** Globe coordinates are percent of the globe box; CSS turns them into container units. */
const positionStyle = (p: { x: number; y: number }) => ({ '--x': p.x, '--y': p.y }) as CSSProperties

function setPosition(el: HTMLElement | SVGElement, x: number, y: number) {
  el.style.setProperty('--x', String(x))
  el.style.setProperty('--y', String(y))
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

function PinIcon() {
  return (
    <svg className={styles.pinIcon} viewBox="0 0 24 32" aria-hidden>
      <path
        d="M12 1.2C6.04 1.2 1.2 5.9 1.2 11.7c0 7.6 9.2 17.6 10 18.5a1.1 1.1 0 0 0 1.6 0c.8-.9 10-10.9 10-18.5C22.8 5.9 17.96 1.2 12 1.2Z"
        fill="currentColor"
        stroke="#fff"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="11.6" r="4.2" fill="#fff" />
    </svg>
  )
}
