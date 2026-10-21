'use client'

import type { ComponentType } from 'react'
import {
  Accessibility,
  Baby,
  Banknote,
  BedDouble,
  Briefcase,
  Building2,
  Bus,
  Car,
  ConciergeBell,
  Dumbbell,
  Flower2,
  Languages,
  LayoutGrid,
  PartyPopper,
  PawPrint,
  Plane,
  SquareParking,
  TramFront,
  UtensilsCrossed,
  Waves,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  AMENITIES,
  AMENITY_SECTIONS,
  POPULAR_AMENITIES,
  travelTimes,
  type Amenity,
  type AmenitySection,
  type Hotel,
} from '@/lib/catalog'
import { DialogButton } from './DialogButton'

type Icon = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>

/** The amenities the page shows first. */
const PREVIEW = 6

const SECTION_ICON: Record<AmenitySection, Icon> = {
  internet: Wifi,
  general: Building2,
  rooms: BedDouble,
  accessibility: Accessibility,
  services: ConciergeBell,
  food: UtensilsCrossed,
  transfer: Plane,
  parking: SquareParking,
  pool: Waves,
  business: Briefcase,
  sport: Dumbbell,
  wellness: Flower2,
  entertainment: PartyPopper,
  kids: Baby,
  pets: PawPrint,
  languages: Languages,
}

/** The popular amenities have icons of their own; the rest take their section's. */
const AMENITY_ICON: Partial<Record<Amenity, Icon>> = {
  'front-desk': ConciergeBell,
  restaurant: UtensilsCrossed,
  shuttle: Plane,
  parking: SquareParking,
  pets: PawPrint,
  pool: Waves,
  family: Baby,
  spa: Flower2,
  gym: Dumbbell,
}
const iconOf = (amenity: Amenity) => AMENITY_ICON[amenity] ?? SECTION_ICON[AMENITIES[amenity].section]

/** By car to the centre, to the city transport and, in a city with one, on foot to the metro. */
function TravelTiles({ hotel }: { hotel: Hotel }) {
  const times = travelTimes(hotel)
  const tiles = [
    { label: 'До центра', minutes: times.centre, note: 'на машине', icon: Car },
    { label: 'До транспорта', minutes: times.transport, note: 'пешком', icon: Bus },
    ...(times.metro === null
      ? []
      : [{ label: 'До метро', minutes: times.metro, note: hotel.metro!.station, icon: TramFront }]),
  ]
  return (
    <ul className="grid max-w-xl auto-cols-fr grid-flow-col divide-x divide-border" aria-label="Время в пути">
      {tiles.map(({ label, minutes, note, icon: TileIcon }) => (
        <li
          key={label}
          className="flex min-w-0 flex-col gap-1 px-[clamp(10px,3vw,20px)] first:pl-0 last:pr-0 sm:flex-row sm:items-center sm:gap-2.5"
        >
          <TileIcon className="size-6 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
            <b className="text-lg/tight">{minutes} мин</b>
            <span className="truncate text-xs text-muted-foreground sm:text-sm">{note}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "Оплачивается отдельно" with the money icon. */
function Paid() {
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Banknote className="size-4 shrink-0" aria-hidden />
      оплачивается отдельно
    </span>
  )
}

/** "Все удобства": every amenity of the hotel by section, the icon on the section. */
function AmenitiesDialog({ hotel }: { hotel: Hotel }) {
  const sections = (Object.keys(AMENITY_SECTIONS) as AmenitySection[])
    .map((section) => ({ section, items: hotel.amenities.filter((key) => AMENITIES[key].section === section) }))
    .filter(({ items }) => items.length > 0)
  return (
    <Dialog>
      <DialogButton icon={LayoutGrid}>Все удобства</DialogButton>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 text-base sm:max-w-2xl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          <DialogTitle className="text-heading font-bold">Удобства</DialogTitle>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {sections.map(({ section, items }) => {
              const SectionIcon = SECTION_ICON[section]
              return (
                <section key={section} aria-label={AMENITY_SECTIONS[section]} className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2 font-bold">
                    <SectionIcon className="size-5 shrink-0 text-success-foreground" aria-hidden />
                    {AMENITY_SECTIONS[section]}
                  </h3>
                  <ul className="flex flex-col gap-1.5 pl-7">
                    {items.map((key) => {
                      const amenity: { label: string; paid?: true } = AMENITIES[key]
                      return (
                        <li key={key}>
                          {amenity.label}
                          {amenity.paid && <Paid />}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
        <div className="flex justify-end border-t p-4">
          <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Об отеле": the description, the travel times, the first popular amenities and all of them in a dialog. */
export function AboutHotel({ hotel }: { hotel: Hotel }) {
  const preview = POPULAR_AMENITIES.filter((key) => hotel.amenities.includes(key)).slice(0, PREVIEW)
  return (
    <section aria-labelledby="about-title" className="flex flex-col gap-5">
      <h2 id="about-title" className="text-heading font-bold">
        Об отеле
      </h2>
      <p className="max-w-3xl">{hotel.description}</p>
      <TravelTiles hotel={hotel} />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3" aria-label="Удобства">
        {preview.map((key) => {
          const AmenityIcon = iconOf(key)
          return (
            <li key={key} className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft">
                <AmenityIcon className="size-5 text-success-foreground" aria-hidden />
              </span>
              <span className="min-w-0 text-sm/snug sm:text-base/snug">{AMENITIES[key].label}</span>
            </li>
          )
        })}
      </ul>
      <AmenitiesDialog hotel={hotel} />
    </section>
  )
}
