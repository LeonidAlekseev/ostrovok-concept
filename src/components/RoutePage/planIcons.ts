import {
  BedDouble,
  Bus,
  Car,
  CarTaxiFront,
  DoorOpen,
  Flag,
  Footprints,
  MapPin,
  Ticket,
  type LucideIcon,
} from 'lucide-react'
import type { PlanItem, TransferMode } from '@/lib/routes'

/** The icons of the plan's items, on the route page and in a trip plan. */
export const TRANSFER_ICON: Record<TransferMode, LucideIcon> = {
  transfer: Bus,
  taxi: CarTaxiFront,
  car: Car,
  walk: Footprints,
}

export const ITEM_ICON: Record<Exclude<PlanItem['kind'], 'transfer'>, LucideIcon> = {
  arrival: MapPin,
  departure: Flag,
  'check-in': BedDouble,
  'check-out': DoorOpen,
  leisure: Ticket,
}
