'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PERSONA_LABEL, PERSONAS, type Persona, type RouteCardData } from '@/lib/routes'
import { useDestinations } from '../Catalog/useDestinations'
import { RouteCard } from '../RouteCard/RouteCard'

// overflow-x: auto clips vertically too: the padding keeps the focus ring and the shadow, negative margins the layout.
const strip =
  '-mx-(--page-x) flex list-none gap-2 overflow-x-auto px-(--page-x) py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/**
 * `#personas`: a tab a persona with routes; the panel switches between the cities of the persona's routes and
 * shows all its routes, the chosen city's outlined. The first persona and its first city are chosen first.
 */
export function PersonaCarousel({ routes }: { routes: readonly RouteCardData[] }) {
  const personas = PERSONAS.filter((persona) => routes.some((route) => route.persona === persona))
  const [persona, setPersona] = useState<Persona | undefined>(personas[0])
  const [chosen, setChosen] = useState<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLLIElement>())
  const destinations = useDestinations()
  if (!persona) return null

  const own = (p: Persona) => routes.filter((route) => route.persona === p)
  const selectedId = own(persona).some((route) => route.id === chosen) ? chosen : own(persona)[0].id
  const choose = (route: RouteCardData) => {
    setChosen(route.id)
    cardRefs.current.get(route.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }

  return (
    <section id="personas" aria-labelledby="personas-title" className="scroll-mt-4">
      <h2 id="personas-title" className="mt-[clamp(8px,2vw,16px)] mb-3 text-title font-bold tracking-[-0.02em]">
        Готовые маршруты для вас
      </h2>
      <Tabs
        value={persona}
        onValueChange={(value) => {
          setPersona(value as Persona)
          setChosen(null)
        }}
      >
        {/* Arrow keys move focus and select the tab (WAI-ARIA automatic activation). */}
        <TabsList aria-label="Кто вы в поездке" activateOnFocus className={strip}>
          {personas.map((p) => (
            <TabsTrigger
              key={p}
              value={p}
              className="h-11 flex-none rounded-full bg-secondary px-5 font-medium whitespace-nowrap text-secondary-foreground transition-colors hover:bg-card data-active:bg-primary data-active:font-[650] data-active:text-primary-foreground"
            >
              {PERSONA_LABEL[p]}
            </TabsTrigger>
          ))}
        </TabsList>
        {personas.map((p) => (
          <TabsContent key={p} value={p} className="flex flex-col gap-2 pt-1">
            <ul aria-label="Города маршрутов" className={strip}>
              {own(p).map((route) => {
                const city = destinations.find((d) => d.id === route.destinationId)
                return (
                  <li key={route.id} className="flex-none">
                    <Button
                      variant="outline"
                      shape="pill"
                      size="sm"
                      aria-pressed={route.id === selectedId}
                      className="aria-pressed:border-primary aria-pressed:bg-primary/10"
                      onClick={() => choose(route)}
                    >
                      {city?.name ?? route.destinationId}
                    </Button>
                  </li>
                )
              })}
            </ul>
            <ul
              aria-label={`Маршруты: ${PERSONA_LABEL[p]}`}
              className={`${strip} snap-x snap-mandatory scroll-px-(--page-x) gap-[clamp(10px,2.4vw,20px)] pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0`}
            >
              {own(p).map((route) => (
                <li
                  key={route.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(route.id, el)
                    else cardRefs.current.delete(route.id)
                  }}
                  className="w-[min(78vw,20rem)] flex-none snap-start md:w-auto"
                >
                  <RouteCard route={route} selected={route.id === selectedId} />
                </li>
              ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
