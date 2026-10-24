'use client'

import { useState, type ComponentType, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import {
  Accessibility,
  Baby,
  Banknote,
  BedDouble,
  Briefcase,
  Building2,
  Car,
  ChevronDown,
  ConciergeBell,
  Dumbbell,
  Flower2,
  Languages,
  LayoutGrid,
  PartyPopper,
  PawPrint,
  Plane,
  Plus,
  SquareParking,
  TramFront,
  UtensilsCrossed,
  Snowflake,
  Waves,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AMENITIES,
  AMENITY_SECTIONS,
  POPULAR_AMENITIES,
  travelDistances,
  workLabels,
  type Amenity,
  type AmenitySection,
  type Hotel,
} from '@/lib/catalog'
import { formatDecimal } from '@/lib/format'
import { DialogButton } from './DialogButton'

type Icon = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>

/** The amenities the page shows first. */
const PREVIEW = 6

/** The tiles of the popular amenities in the overview, before "Все удобства (N)". */
const TILES = 7

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
  wifi: Wifi,
  'air-conditioning': Snowflake,
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
/** Shorter words of the long amenities for the overview tiles; the dialog keeps the full ones. */
const TILE_LABEL: Partial<Record<Amenity, string>> = {
  wifi: 'Wi‑Fi',
  'front-desk': 'Ресепшен 24/7',
  family: 'Для семей с детьми',
}

const iconOf = (amenity: Amenity) => AMENITY_ICON[amenity] ?? SECTION_ICON[AMENITIES[amenity].section]

/**
 * Kilometres to the centre, in a city with a metro to the metro and, where the city's airport is known, straight
 * to the airport: one white card, the tiles parted by lines.
 */
export function TravelTiles({ hotel }: { hotel: Hotel }) {
  const distances = travelDistances(hotel)
  const tiles = [
    { label: 'До центра', note: 'города', km: distances.centre, icon: Car },
    ...(distances.metro === null
      ? []
      : [{ label: 'До метро', note: hotel.metro!.station, km: distances.metro, icon: TramFront }]),
    ...(distances.airport === null
      ? []
      : [{ label: 'До аэропорта', note: 'по прямой', km: distances.airport, icon: Plane }]),
  ]
  return (
    <ul
      className="grid auto-cols-fr grid-flow-col divide-x divide-border rounded-xl bg-card py-3 shadow-(--shadow-card)"
      aria-label="Расстояния"
    >
      {tiles.map(({ label, note, km, icon: TileIcon }) => (
        <li
          key={label}
          className="flex min-w-0 flex-col gap-1 px-[clamp(10px,3vw,20px)] sm:flex-row sm:items-center sm:gap-2.5"
        >
          <TileIcon className="size-6 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
            <b className="text-lg/tight">{formatDecimal(km)} км</b>
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

/** The lines of "Все удобства": the Wi‑Fi speed and the workspace, then every amenity of the hotel. */
const amenityCount = (hotel: Hotel) => workLabels(hotel).length + hotel.amenities.length

/** "Все удобства (N)": every amenity of the hotel by section, the icon on the section; `trigger` opens it. */
function AmenitiesDialog({ hotel, trigger }: { hotel: Hotel; trigger?: ReactElement }) {
  const sections = (Object.keys(AMENITY_SECTIONS) as AmenitySection[])
    .map((section) => ({ section, items: hotel.amenities.filter((key) => AMENITIES[key].section === section) }))
    .filter(({ items }) => items.length > 0)
  const [wifi, ...workspace] = workLabels(hotel)
  return (
    <Dialog>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : (
        <DialogButton icon={LayoutGrid}>Все удобства ({amenityCount(hotel)})</DialogButton>
      )}
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
                    {section === 'internet' && <li>{wifi}</li>}
                    {section === 'internet' && workspace.map((label) => <li key={label}>{label}</li>)}
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

/** The description folds to a few lines on a phone from this length, chars. */
const FOLD_FROM = 240

/**
 * The overview: up to 7 tiles of the hotel's popular amenities with "Все удобства (N)" after them, of one width
 * across the row (below `lg` 3 and the last), "Об отеле" with the description (folded on a phone under "Читать полностью") and the
 * distances.
 */
export function AboutHotel({ hotel, children }: { hotel: Hotel; children?: ReactNode }) {
  const [unfolded, setUnfolded] = useState(false)
  const folds = hotel.description.length > FOLD_FROM && !unfolded
  const tiles = POPULAR_AMENITIES.filter((key) => hotel.amenities.includes(key)).slice(0, TILES)
  // Every tile and "Все удобства" share the row: up to 8 columns from `lg`, up to 4 below it.
  const columns = { '--wide': tiles.length + 1, '--narrow': Math.min(tiles.length, 3) + 1 } as CSSProperties
  const tile =
    'flex min-h-22 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-card px-1 py-2 text-center text-[11px]/tight shadow-(--shadow-card) sm:text-xs/tight xl:text-[13px]/tight'
  return (
    <section id="overview" tabIndex={-1} aria-label="Обзор" className="flex flex-col gap-6 outline-none">
      <div>
        <ul
          style={columns}
          className="grid grid-cols-[repeat(var(--narrow),minmax(0,1fr))] gap-1.5 sm:gap-2 lg:grid-cols-[repeat(var(--wide),minmax(0,1fr))]"
          aria-label="Популярные удобства"
        >
          {tiles.map((key, i) => {
            const AmenityIcon = iconOf(key)
            return (
              <li key={key} className={cn(tile, i >= 3 && 'hidden lg:flex')}>
                <AmenityIcon className="size-6 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
                <span className="line-clamp-3 [hyphens:manual] [word-break:keep-all]">
                  {TILE_LABEL[key] ?? AMENITIES[key].label}
                </span>
              </li>
            )
          })}
          <li className="contents">
            <AmenitiesDialog
              hotel={hotel}
              trigger={
                <button type="button" className={cn(tile, 'transition-colors hover:bg-secondary')}>
                  <Plus className="size-6 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
                  <span>Все удобства ({amenityCount(hotel)})</span>
                </button>
              }
            />
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        <h2 id="about-title" className="text-heading font-bold">
          Об отеле
        </h2>
        <p id="about-text" className={cn('max-w-3xl', folds && 'max-md:line-clamp-5')}>
          {hotel.description}
        </p>
        {folds && (
          <button
            type="button"
            aria-expanded={false}
            aria-controls="about-text"
            className="flex items-center gap-1 self-start font-semibold text-primary md:hidden"
            onClick={() => setUnfolded(true)}
          >
            Читать полностью
            <ChevronDown className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <TravelTiles hotel={hotel} />
      {children}
    </section>
  )
}

/** "Удобства": the Wi‑Fi speed, the workspace and the first popular amenities with green icons, and all of them in a dialog. */
export function HotelAmenities({ hotel }: { hotel: Hotel }) {
  const [wifi, ...workspace] = workLabels(hotel)
  const work = [
    { key: 'wifi-speed', label: wifi, Icon: Wifi },
    ...workspace.map((label) => ({ key: 'workspace', label, Icon: Briefcase })),
  ]
  const preview = POPULAR_AMENITIES.filter((key) => key !== 'wifi' && hotel.amenities.includes(key))
    .slice(0, PREVIEW - work.length)
    .map((key) => ({ key, label: AMENITIES[key].label, Icon: iconOf(key) }))
  return (
    <section
      id="amenities"
      tabIndex={-1}
      aria-labelledby="amenities-title"
      className="flex flex-col gap-5 outline-none"
    >
      <h2 id="amenities-title" className="text-heading font-bold">
        Удобства
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3" aria-label="Удобства">
        {[...work, ...preview].map(({ key, label, Icon: AmenityIcon }) => (
          <li key={key} className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft">
              <AmenityIcon className="size-5 text-success-foreground" aria-hidden />
            </span>
            <span className="min-w-0 text-sm/snug sm:text-base/snug">{label}</span>
          </li>
        ))}
      </ul>
      <AmenitiesDialog hotel={hotel} />
    </section>
  )
}
