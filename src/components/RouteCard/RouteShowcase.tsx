import type { RouteCardData } from '@/lib/routes'
import { RouteCard } from './RouteCard'

/** `#routes`: every route of the database, the featured first (the order of `loadRouteCards`); none, no section. */
export function RouteShowcase({ routes }: { routes: readonly RouteCardData[] }) {
  if (routes.length === 0) return null
  return (
    <section id="routes" aria-labelledby="routes-title" className="scroll-mt-4">
      <h2 id="routes-title" className="mt-[clamp(8px,2vw,16px)] mb-3 text-title font-bold tracking-[-0.02em]">
        Все маршруты
      </h2>
      <ul className="grid list-none gap-[clamp(10px,2.4vw,20px)] sm:grid-cols-2 lg:grid-cols-3">
        {routes.map((route) => (
          <li key={route.id}>
            <RouteCard route={route} />
          </li>
        ))}
      </ul>
    </section>
  )
}
