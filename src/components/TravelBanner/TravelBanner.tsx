import { Compass, Plane } from 'lucide-react'
import styles from './TravelBanner.module.css'

export function TravelBanner() {
  return (
    <section className={styles.banner} id="explore" aria-labelledby="explore-title">
      <span className={styles.badge} aria-hidden>
        <Compass size={22} strokeWidth={1.8} />
      </span>
      <p className={styles.text}>
        <strong id="explore-title" className={styles.title}>
          Исследуйте мир —
        </strong>
        <span className={styles.subtitle}>выбирайте свой следующий отель</span>
      </p>
      <span className={styles.route} aria-hidden>
        <svg className={styles.trailSvg} viewBox="0 0 180 70" preserveAspectRatio="xMaxYMid meet">
          <path className={styles.trail} d="M4 40 C 18 10, 46 2, 54 22 S 50 66, 84 60 S 132 40, 150 28" />
        </svg>
        <Plane className={styles.plane} size={30} fill="currentColor" strokeWidth={1} />
      </span>
    </section>
  )
}
