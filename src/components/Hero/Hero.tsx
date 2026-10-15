import { useMemo } from 'react'
import { ChevronRight, Plane } from 'lucide-react'
import type { Destination } from '../../data/destinations'
import { formatPrice } from '../../lib/format'
import { SmartImage } from '../ui/SmartImage'
import { arc, globeMarkers, pointOnRoute, routePath, type Point } from './globeGeometry'
import styles from './Hero.module.css'

interface Props {
  markers: Destination[]
  featured: Destination
  featuredImage: string
  selectedId: string | null
  onSelect: (destination: Destination) => void
}

/** Off-globe starting points (percent of the globe box) for routes arriving from afar. */
const farOrigins: Point[] = [
  { x: -22, y: 30 },
  { x: -30, y: 52 },
  { x: -14, y: 70 },
]

export function Hero({ markers, featured, featuredImage, selectedId, onSelect }: Props) {
  const { pins, routes, plane, hub } = useMemo(() => {
    const pins = globeMarkers(markers)
    const hub = pins.find((m) => m.destination.id === featured.id)
    if (!hub) throw new Error(`Featured destination "${featured.id}" must be visible on the globe`)
    const byId = (id: string) => pins.find((m) => m.destination.id === id)?.point ?? hub.point
    const routes = [
      arc('london', hub.point, byId('london'), 0.35),
      arc('tbilisi', hub.point, byId('tbilisi'), 0.18),
      arc('lisbon', hub.point, byId('lisbon'), 0.25),
      arc('far-1', farOrigins[0], byId('london'), 0.12),
      arc('far-2', farOrigins[1], hub.point, 0.16),
      arc('far-3', farOrigins[2], byId('lisbon'), 0.2),
    ]
    return { pins, routes, hub, plane: pointOnRoute(routes[4], 0.42) }
  }, [markers, featured])

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.sky} aria-hidden>
        <span className={styles.sparkle} style={{ left: '6%', top: '14%' }} />
        <span className={styles.sparkle} style={{ left: '93%', top: '9%' }} />
        <span className={styles.sparkle} style={{ left: '84%', top: '32%' }} />
        <span className={`${styles.sparkle} ${styles.sparkleSmall}`} style={{ left: '18%', top: '36%' }} />
      </div>

      <div className={styles.copy}>
        <h1 id="hero-title" className={styles.title}>
          Мир ближе, чем кажется
        </h1>
        <p className={styles.subtitle}>Найдите место для следующего путешествия</p>
      </div>

      <div className={styles.globe}>
        <div className={styles.atmosphere} aria-hidden />
        <img
          className={styles.earth}
          src="/images/earth-europe-1200.webp"
          srcSet="/images/earth-europe-1200.webp 1200w, /images/earth-europe-2000.webp 2000w"
          sizes="(min-width: 768px) 1100px, 175vw"
          alt="Земля из космоса: Европа, Средиземное море и Северная Африка"
          width={1200}
          height={1200}
          fetchPriority="high"
          onError={(e) => e.currentTarget.classList.add(styles.earthFailed)}
        />
        <div className={styles.rim} aria-hidden />
        <div className={styles.sun} aria-hidden />
        <div className={styles.cityGlow} style={pos(hub.point)} aria-hidden />

        <svg className={styles.routes} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          {routes.map((route) => (
            <g key={route.id}>
              <path className={styles.routeGlow} d={routePath(route)} filter="url(#route-glow)" />
              <path className={styles.route} d={routePath(route)} pathLength={100} />
            </g>
          ))}
        </svg>

        <Plane
          className={styles.plane}
          style={{ ...pos(plane), transform: `translate(-50%, -50%) rotate(${plane.angle + 45}deg)` }}
          size={26}
          fill="currentColor"
          strokeWidth={1}
          aria-hidden
        />

        {pins.map(({ destination, point }) => {
          const isHub = destination.id === featured.id
          return (
            <button
              key={destination.id}
              type="button"
              className={`${styles.pin} ${isHub ? styles.pinHub : ''}`}
              style={pos(point)}
              aria-label={`${destination.name}, ${destination.country} — выбрать направление`}
              aria-pressed={selectedId === destination.id}
              onClick={() => onSelect(destination)}
            >
              <PinIcon />
              <span className={styles.pinTooltip} aria-hidden>
                {destination.name}
              </span>
            </button>
          )
        })}

        <button type="button" className={styles.placeCard} style={pos(hub.point)} onClick={() => onSelect(featured)}>
          <SmartImage className={styles.placeImage} src={featuredImage} alt="" width={88} height={76} />
          <span className={styles.placeText}>
            <span className={styles.placeName}>{featured.name}</span>
            <span className={styles.placePrice}>от {formatPrice(featured.priceFrom)}/ночь</span>
          </span>
          <ChevronRight className={styles.placeChevron} aria-hidden />
        </button>
      </div>
    </section>
  )
}

const pos = (p: Point) => ({ left: `${p.x}%`, top: `${p.y}%` })

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
