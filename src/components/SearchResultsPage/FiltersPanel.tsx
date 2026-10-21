import { useId, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Slider } from '@/components/ui/slider'
import { AMENITIES, AMENITY_SECTIONS, MEAL_LABEL, type AmenitySection } from '../../lib/catalog'
import { countRu, formatPrice } from '../../lib/format'
import {
  AMENITY_OPTIONS,
  countFilters,
  MEAL_OPTIONS,
  NO_FILTERS,
  PRICE_STEP,
  RATING_SCALE,
  SORTS,
  STAR_OPTIONS,
  type Filters,
  type Sort,
} from '../../lib/results'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
  /** The ends of the price slider: the cheapest and the dearest night of the results without filters. */
  priceBounds: [number, number]
  /** Inside the bottom sheet: no card of its own and no reset button, the sheet footer has it. */
  embedded?: boolean
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
const toPrice = (text: string) => {
  const digits = text.replace(/\D/g, '')
  return digits ? Number(digits) : null
}
/** A bound at the end of its slider is no bound. */
const bound = (value: number, end: number) => (value === end ? null : value)
const formatRating = (rating: number) => String(rating).replace('.', ',')

/** The amenities of the catalogue by their section, in its order. */
const AMENITY_GROUPS = (Object.keys(AMENITY_SECTIONS) as AmenitySection[]).map((section) => ({
  section,
  amenities: AMENITY_OPTIONS.filter((a) => AMENITIES[a].section === section),
}))

function Group({ legend, children, className }: { legend: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
      <legend className="mb-2 font-semibold">{legend}</legend>
      {children}
    </fieldset>
  )
}

/** A filter value: one look for every group, pressed is outlined in the primary colour. */
function Chip({
  pressed,
  onPress,
  label,
  children,
  className,
}: {
  pressed: boolean
  onPress: () => void
  /** The name for screen readers when the text is short, as "5★". */
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onPress}
      className={cn(
        'inline-flex min-h-9 items-center gap-1 rounded-lg border border-transparent bg-(--decor-surface-soft) px-2.5 py-1.5 text-left text-sm/[normal] transition-[background-color,border-color] outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-secondary aria-pressed:font-[650] aria-pressed:text-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}

const chips = 'flex flex-wrap gap-1.5'

/**
 * Sorting first, then price per night and guest rating on sliders; stars, meals, free cancellation and
 * the amenities by their section are chips.
 */
export function FiltersPanel({ filters, onChange, priceBounds, embedded = false }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const count = countFilters(filters)
  const sortId = useId()
  const [priceLow, priceHigh] = priceBounds
  const price = [filters.priceMin ?? priceLow, filters.priceMax ?? priceHigh]
  const rating = [filters.ratingMin ?? RATING_SCALE.min, filters.ratingMax ?? RATING_SCALE.max]
  return (
    <div className={cn('flex flex-col gap-5', !embedded && 'rounded-2xl bg-card p-4 shadow-(--shadow-card)')}>
      <div className="flex flex-col gap-2">
        <label htmlFor={sortId} className="font-semibold">
          Сортировка
        </label>
        <NativeSelect
          id={sortId}
          className="w-full [&_select]:h-10 [&_select]:rounded-lg [&_select]:border-transparent [&_select]:bg-(--decor-surface-soft) [&_select]:pl-3"
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as Sort })}
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <Group legend="Цена за ночь, ₽">
        <Slider
          min={priceLow}
          max={priceHigh}
          step={PRICE_STEP}
          value={price}
          thumbLabels={['Цена за ночь от', 'Цена за ночь до']}
          onValueChange={(value) => {
            const [min, max] = value as number[]
            set({ priceMin: bound(min, priceLow), priceMax: bound(max, priceHigh) })
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="numeric"
            placeholder={`от ${formatPrice(priceLow)}`}
            aria-label="Цена за ночь от"
            value={filters.priceMin ?? ''}
            onChange={(e) => set({ priceMin: toPrice(e.target.value) })}
            className="border-transparent bg-(--decor-surface-soft)"
          />
          <Input
            inputMode="numeric"
            placeholder={`до ${formatPrice(priceHigh)}`}
            aria-label="Цена за ночь до"
            value={filters.priceMax ?? ''}
            onChange={(e) => set({ priceMax: toPrice(e.target.value) })}
            className="border-transparent bg-(--decor-surface-soft)"
          />
        </div>
      </Group>

      <Group legend="Звёзды">
        {/* One row even in the narrow side panel. */}
        <div className="grid grid-cols-5 gap-1.5">
          {STAR_OPTIONS.map((stars) => (
            <Chip
              key={stars}
              label={countRu(stars, ['звезда', 'звезды', 'звёзд'])}
              pressed={filters.stars.includes(stars)}
              onPress={() => set({ stars: toggle(filters.stars, stars) })}
              className="justify-center px-1"
            >
              {stars}
              <Star className="size-3.5 text-(--decor-star)" fill="currentColor" strokeWidth={0} aria-hidden />
            </Chip>
          ))}
        </div>
      </Group>

      <Group legend="Рейтинг">
        <p className="text-sm/[normal] text-muted-foreground" aria-hidden>
          от {formatRating(rating[0])} до {formatRating(rating[1])}
        </p>
        <Slider
          min={RATING_SCALE.min}
          max={RATING_SCALE.max}
          step={RATING_SCALE.step}
          value={rating}
          thumbLabels={['Рейтинг от', 'Рейтинг до']}
          onValueChange={(value) => {
            const [min, max] = value as number[]
            set({ ratingMin: bound(min, RATING_SCALE.min), ratingMax: bound(max, RATING_SCALE.max) })
          }}
        />
      </Group>

      <Group legend="Питание">
        <div className={chips}>
          {MEAL_OPTIONS.map((meal) => (
            <Chip
              key={meal}
              pressed={filters.meals.includes(meal)}
              onPress={() => set({ meals: toggle(filters.meals, meal) })}
            >
              {MEAL_LABEL[meal]}
            </Chip>
          ))}
        </div>
      </Group>

      <Group legend="Условия">
        <div className={chips}>
          <Chip pressed={filters.freeCancel} onPress={() => set({ freeCancel: !filters.freeCancel })}>
            Бесплатная отмена
          </Chip>
        </div>
      </Group>

      <Group legend="Удобства" className="gap-4">
        {AMENITY_GROUPS.map(({ section, amenities }) => (
          <fieldset key={section} className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm/[normal] text-muted-foreground">{AMENITY_SECTIONS[section]}</legend>
            <div className={chips}>
              {amenities.map((amenity) => (
                <Chip
                  key={amenity}
                  pressed={filters.amenities.includes(amenity)}
                  onPress={() => set({ amenities: toggle(filters.amenities, amenity) })}
                >
                  {AMENITIES[amenity].label}
                </Chip>
              ))}
            </div>
          </fieldset>
        ))}
      </Group>

      {!embedded && count > 0 && (
        <Button variant="outline" onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort })}>
          Сбросить фильтры
        </Button>
      )}
    </div>
  )
}
