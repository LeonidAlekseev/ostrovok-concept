import type { Verdict } from '@/lib/view'

/** The colours of the map of «Вид из отеля», shared with its legend (the map itself loads only in the browser). */

/** The lines to the targets by their verdict from the chosen floor. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  visible: '#16a34a',
  obstructed: '#d97706',
  unknown: '#94a3b8',
}

/** The buildings: the hotel's, the ones in the way from the chosen floor, the rest by the source of their height. */
export const HOTEL_BUILDING_COLOR = '#2563eb'
export const BLOCKER_COLOR = '#f97316'
export const BUILDING_COLOR = '#a1a1aa'
export const ESTIMATED_BUILDING_COLOR = '#d4d4d8'

/** The fan of the chosen side and the lines of the sun. */
export const SECTOR_COLOR = '#3b82f6'
export const SUNSET_COLOR = '#ea580c'
export const SUNRISE_COLOR = '#eab308'
