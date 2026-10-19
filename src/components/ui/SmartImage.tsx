import { useState, type ImgHTMLAttributes } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from 'cn'

type Props = ImgHTMLAttributes<HTMLImageElement> & { alt: string }

/** <img> that swaps to a neutral placeholder if the file fails to load. */
export function SmartImage({ className, alt, ...rest }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className={cn(
          'grid place-items-center bg-linear-135 from-(--decor-photo-from) to-(--decor-photo-to) text-(--decor-light)/70',
          className,
        )}
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      >
        <ImageOff aria-hidden size={22} strokeWidth={1.6} />
      </span>
    )
  }
  return <img {...rest} className={className} alt={alt} onError={() => setFailed(true)} />
}
