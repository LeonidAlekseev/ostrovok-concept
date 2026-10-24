'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TileHotel } from '@/lib/catalog'
import { PERSONA_LABEL, type Persona } from '@/lib/personas'
import { hotelHref } from '@/lib/search'
import { HotelTile } from '../HotelTile/HotelTile'

export interface PersonaSelection {
  persona: Persona
  /** One a city, the best for the persona first. */
  hotels: readonly TileHotel[]
}

// overflow-x: auto clips vertically too: the padding keeps the focus ring and the shadow, negative margins the layout.
const strip =
  '-mx-(--page-x) flex list-none gap-2 overflow-x-auto px-(--page-x) py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/** `#personas`: a tab a persona with hotels, the panel its selection of hotels; the first persona is chosen first. */
export function PersonaCarousel({ selections }: { selections: readonly PersonaSelection[] }) {
  const shown = selections.filter((s) => s.hotels.length > 0)
  const [persona, setPersona] = useState<Persona | undefined>(shown[0]?.persona)
  if (!persona) return null

  return (
    <section id="personas" aria-labelledby="personas-title" className="scroll-mt-4">
      <h2 id="personas-title" className="mt-[clamp(8px,2vw,16px)] mb-3 text-title font-bold tracking-[-0.02em]">
        Подборки отелей для вас
      </h2>
      <Tabs value={persona} onValueChange={(value) => setPersona(value as Persona)}>
        {/* Arrow keys move focus and select the tab (WAI-ARIA automatic activation). */}
        <TabsList aria-label="Кто вы в поездке" activateOnFocus className={strip}>
          {shown.map(({ persona: p }) => (
            <TabsTrigger
              key={p}
              value={p}
              className="h-11 flex-none rounded-full bg-secondary px-5 font-medium whitespace-nowrap text-secondary-foreground transition-colors hover:bg-card data-active:bg-primary data-active:font-[650] data-active:text-primary-foreground"
            >
              {PERSONA_LABEL[p]}
            </TabsTrigger>
          ))}
        </TabsList>
        {shown.map(({ persona: p, hotels }) => (
          <TabsContent key={p} value={p} className="pt-1">
            <ul
              aria-label={`Отели: ${PERSONA_LABEL[p]}`}
              className={`${strip} snap-x snap-mandatory scroll-px-(--page-x) gap-[clamp(10px,2.4vw,20px)] pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0`}
            >
              {hotels.map((hotel) => (
                <li key={hotel.id} className="w-[min(78vw,20rem)] flex-none snap-start md:w-auto">
                  {/* Arrows only on the photos: a swipe scrolls the row. */}
                  <HotelTile hotel={hotel} href={hotelHref(hotel.id)} swipePhotos={false} />
                </li>
              ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
