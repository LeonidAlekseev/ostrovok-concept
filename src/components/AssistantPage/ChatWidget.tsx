'use client'

import { cn } from 'cn'
import type { ChatWidget as ChatWidgetData } from '@/lib/chatWidget'
import { NoiseAnswer } from '../HotelPage/HotelNoise'
import { ViewAnswer } from '../HotelPage/HotelView'

const TITLE: Record<ChatWidgetData['kind'], string> = {
  noise: 'Шум у отеля',
  view: 'Вид из окна',
}

/**
 * The widget of Эвал's answer in a hotel's chat, under its words: the block of the hotel page the question is about —
 * the noise map with the estimate, or the map of the view with the verdicts. The maps load only in the browser, with
 * the widget; without one the text of the block stays.
 */
export function ChatWidget({ widget, className }: { widget: ChatWidgetData; className?: string }) {
  return (
    <section
      aria-label={`${TITLE[widget.kind]}: ${widget.hotel.name}`}
      data-widget={widget.kind}
      className={cn('flex w-full max-w-xl flex-col gap-3 rounded-[18px] bg-muted p-3', className)}
    >
      <h3 className="px-1 text-[15px]/[1.3] font-semibold">{TITLE[widget.kind]}</h3>
      {widget.kind === 'noise' ? <NoiseAnswer widget={widget} /> : <ViewAnswer widget={widget} />}
    </section>
  )
}
