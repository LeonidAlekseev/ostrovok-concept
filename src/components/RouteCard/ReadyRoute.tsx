import { useId } from 'react'
import type { RouteCardData } from '@/lib/routes'
import { RouteCard } from './RouteCard'

/** «Готовый маршрут» over the hotels of the vibe, the stars and the assistant's plan; nothing without a route. */
export function ReadyRoute({ route }: { route: RouteCardData | null }) {
  const labelId = useId()
  if (!route) return null
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      {/* Not a heading: the results go down to h4, so the route stays on the level of the hotels. */}
      <p id={labelId} className="font-semibold">
        Готовый маршрут
      </p>
      <RouteCard route={route} heading="h4" className="sm:max-w-sm" />
    </section>
  )
}
