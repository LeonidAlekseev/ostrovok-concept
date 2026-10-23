import Link from 'next/link'
import { cn } from 'cn'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { countRu, formatPrice } from '@/lib/format'
import type { RouteCardData } from '@/lib/routes'
import { useDestination } from '../Catalog/useDestinations'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

/** The estimate of the route page: «≈ 84 000 ₽ за 5 ночей». */
const routeEstimate = (route: Pick<RouteCardData, 'price' | 'nights'>) =>
  `≈ ${formatPrice(route.price)} за ${countRu(route.nights, nightForms)}`

interface Props {
  route: RouteCardData
  /** Heading level of the title, below the heading of the list. */
  heading?: 'h3' | 'h4'
  /** Outlined: the route of the chosen city. */
  selected?: boolean
  className?: string
}

/**
 * The card of a ready-made route, a link to its page: the cover (a gradient by its tone until routes have
 * photos), the title, the city and the nights, the author and the estimate.
 */
export function RouteCard({ route, heading: Heading = 'h3', selected = false, className }: Props) {
  const destination = useDestination(route.destinationId)
  return (
    <Link
      href={`/routes/${route.id}`}
      data-selected={selected || undefined}
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-2xl bg-card text-foreground shadow-(--shadow-card) transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-popover) data-selected:ring-2 data-selected:ring-primary',
        className,
      )}
    >
      <PhotoPlaceholder photo={route.cover} className="aspect-[16/9] w-full" />
      <span className="flex flex-1 flex-col gap-1 p-3">
        <Heading className="text-base/tight font-bold">{route.title}</Heading>
        <span className="text-sm text-muted-foreground">
          {destination ? `${destination.name}, ${destination.country}` : null} · {countRu(route.nights, nightForms)}
        </span>
        <span className="text-sm text-muted-foreground">
          Автор: <span className="font-medium text-foreground">{route.author}</span>
        </span>
        <span className="mt-auto pt-1 font-semibold">{routeEstimate(route)}</span>
      </span>
    </Link>
  )
}
