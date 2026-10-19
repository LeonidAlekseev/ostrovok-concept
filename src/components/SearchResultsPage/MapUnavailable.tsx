import { MapPinOff } from 'lucide-react'

/** Stands in for the map when it cannot load: offline, the tile service is down, or no WebGL. */
export function MapUnavailable() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted p-6 text-center text-muted-foreground">
      <MapPinOff className="size-8" strokeWidth={1.6} aria-hidden />
      <p className="font-semibold text-foreground">Карта недоступна</p>
      <p className="text-sm/[normal]">Список отелей и фильтры работают как обычно.</p>
    </div>
  )
}
