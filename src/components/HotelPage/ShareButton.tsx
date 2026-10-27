'use client'

import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Hotel } from '@/lib/catalog'
import { setGuestParams, setStayParams } from '@/lib/search'
import { useHotelStay } from './stayContext'

/** How long "Ссылка скопирована" stays, ms. */
const COPIED_MS = 2500

/**
 * "Поделиться": the system share sheet with the link to the hotel and the page's dates and guests; where
 * there is none, the link goes to the clipboard and "Ссылка скопирована" shows under the button.
 */
export function ShareButton({ hotel, className }: { hotel: Hotel; className?: string }) {
  const { stay, guests } = useHotelStay()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const share = async () => {
    const params = stay ? setStayParams(new URLSearchParams(), stay) : setGuestParams(new URLSearchParams(), guests)
    // Built from the hotel, not the address: the address may carry the page's other parameters.
    const url = `${window.location.origin}/hotels/${hotel.id}?${params}`
    if (typeof navigator.share === 'function') {
      // The user closing the sheet rejects the promise; there is nothing to report.
      await navigator.share({ title: hotel.name, url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="icon-sm"
        className={cn('text-primary shadow-(--shadow-card)', className)}
        aria-label="Поделиться"
        onClick={share}
      >
        <Share className="size-5" strokeWidth={2} aria-hidden />
      </Button>
      <span
        role="status"
        className={cn(
          'pointer-events-none absolute top-full right-0 z-30 mt-2 rounded-md bg-foreground px-2.5 py-1 text-sm whitespace-nowrap text-background',
          !copied && 'sr-only',
        )}
      >
        {copied ? 'Ссылка скопирована' : ''}
      </span>
    </div>
  )
}
