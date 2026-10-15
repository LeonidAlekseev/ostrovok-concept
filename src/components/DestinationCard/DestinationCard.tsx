import { ArrowRight } from 'lucide-react'
import { SmartImage } from '../ui/SmartImage'
import styles from './DestinationCard.module.css'

interface Props {
  title: string
  image: string
  alt: string
  /** Lowest nightly price, already formatted. */
  price: string
  selected?: boolean
  onSelect: () => void
}

export function DestinationCard({ title, image, alt, price, selected = false, onSelect }: Props) {
  return (
    <button
      type="button"
      className={styles.card}
      aria-pressed={selected}
      aria-label={`${title}, от ${price} — подставить в поиск`}
      onClick={onSelect}
    >
      <SmartImage className={styles.image} src={image} alt={alt} loading="lazy" width={900} height={783} />
      <span className={styles.shade} aria-hidden />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.price}>от {price}</span>
      </span>
      <span className={styles.arrow} aria-hidden>
        <ArrowRight size={20} strokeWidth={2.2} />
      </span>
    </button>
  )
}
