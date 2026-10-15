import { useState, type ImgHTMLAttributes } from 'react'
import { ImageOff } from 'lucide-react'
import styles from './SmartImage.module.css'

type Props = ImgHTMLAttributes<HTMLImageElement> & { alt: string }

/** <img> that swaps to a neutral placeholder if the file fails to load. */
export function SmartImage({ className, alt, ...rest }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className={`${styles.fallback} ${className ?? ''}`}
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      >
        <ImageOff aria-hidden size={22} strokeWidth={1.6} />
      </span>
    )
  }
  return <img {...rest} className={className} alt={alt} onError={() => setFailed(true)} />
}
