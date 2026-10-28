import Link from 'next/link'
import { BellRing, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hotelHref } from '../../lib/search'
import { HotelierChat, HotelierChatProvider } from '../HotelierChat/HotelierChat'

interface Props {
  hotelId: string
  /** The hotel's name, when the list of chats read it. */
  hotelName: string | null
  onBack: () => void
  className?: string
}

/**
 * The traveller's chat with a hotel's hotelier on the page «Мои чаты»: the same chat as the tab «Отельер» of the hotel's
 * page (their newest chat with the hotel), under a header with «назад» on phones and the link to the hotel.
 */
export function HotelierRoom({ hotelId, hotelName, onBack, className = '' }: Props) {
  return (
    <section aria-label="Чат с отельером" className={`flex min-h-0 min-w-0 flex-col gap-3 ${className}`}>
      <HotelierChatProvider hotelId={hotelId}>
        <header className="flex flex-none items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1.5 lg:hidden"
            aria-label="Назад к чатам"
            onClick={onBack}
          >
            <ChevronLeft className="size-7" aria-hidden />
          </Button>
          <span
            className="grid size-11 flex-none place-items-center rounded-full bg-muted text-muted-foreground-strong"
            aria-hidden
          >
            <BellRing className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="min-w-0 truncate text-[clamp(18px,5vw,22px)]/[1.25] font-bold tracking-[-0.01em]">
              <Link href={hotelHref(hotelId)} className="text-primary hover:underline">
                {hotelName ?? 'Отель'}
              </Link>
            </h2>
            <p className="truncate text-[15px]/[1.35] text-muted-foreground">Чат с отельером</p>
          </div>
        </header>
        <HotelierChat fill />
      </HotelierChatProvider>
    </section>
  )
}
