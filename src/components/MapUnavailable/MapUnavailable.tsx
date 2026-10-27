import { MapPinOff } from 'lucide-react'

/** The hint of the search: its list works without the map. */
export const SEARCH_MAP_HINT = 'Список отелей и фильтры работают как обычно.'

/**
 * Stands in for a map that cannot load: offline, the tile service is down, no WebGL or its chunk failed. `hint` says
 * what still works (the search's list); a map of the hotel page has none.
 */
export function MapUnavailable({ hint }: { hint?: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted p-6 text-center text-muted-foreground">
      <MapPinOff className="size-8" strokeWidth={1.6} aria-hidden />
      <p className="font-semibold text-foreground">Карта недоступна</p>
      {hint && <p className="text-sm/[normal]">{hint}</p>}
    </div>
  )
}
