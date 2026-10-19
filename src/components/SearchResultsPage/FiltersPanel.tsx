import { useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { MEAL_LABEL } from '../../lib/catalog'
import { countRu } from '../../lib/format'
import { countFilters, MEAL_OPTIONS, NO_FILTERS, RATING_OPTIONS, STAR_OPTIONS, type Filters } from '../../lib/results'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
}

const toggle = <T,>(list: T[], value: T, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value))
const toPrice = (text: string) => {
  const digits = text.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 font-semibold">{legend}</legend>
      {children}
    </fieldset>
  )
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <label htmlFor={id} className="text-sm/[normal]">
        {label}
      </label>
    </div>
  )
}

const ratingItem =
  'h-9 rounded-lg border border-transparent bg-(--decor-surface-soft) px-2.5 text-sm/[normal] transition-[background-color,border-color] hover:bg-secondary data-checked:border-primary data-checked:bg-secondary data-checked:font-[650] data-checked:text-primary'

/** Price per night, stars, minimal rating, meals and free cancellation. */
export function FiltersPanel({ filters, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const count = countFilters(filters)
  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-card p-4 shadow-(--shadow-card)">
      <Group legend="Цена за ночь, ₽">
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="numeric"
            placeholder="от"
            aria-label="Цена за ночь от"
            value={filters.priceMin ?? ''}
            onChange={(e) => set({ priceMin: toPrice(e.target.value) })}
          />
          <Input
            inputMode="numeric"
            placeholder="до"
            aria-label="Цена за ночь до"
            value={filters.priceMax ?? ''}
            onChange={(e) => set({ priceMax: toPrice(e.target.value) })}
          />
        </div>
      </Group>

      <Group legend="Звёзды">
        {STAR_OPTIONS.map((stars) => (
          <CheckboxRow
            key={stars}
            label={countRu(stars, ['звезда', 'звезды', 'звёзд'])}
            checked={filters.stars.includes(stars)}
            onChange={(on) => set({ stars: toggle(filters.stars, stars, on) })}
          />
        ))}
      </Group>

      <Group legend="Рейтинг">
        <RadioGroup
          className="flex flex-wrap gap-1.5"
          value={filters.rating === null ? 'any' : String(filters.rating)}
          onValueChange={(value) => set({ rating: value === 'any' ? null : Number(value) })}
        >
          <RadioGroupItem value="any" className={ratingItem}>
            Любой
          </RadioGroupItem>
          {RATING_OPTIONS.map((rating) => (
            <RadioGroupItem key={rating} value={String(rating)} className={ratingItem}>
              от {rating}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </Group>

      <Group legend="Питание">
        {MEAL_OPTIONS.map((meal) => (
          <CheckboxRow
            key={meal}
            label={MEAL_LABEL[meal]}
            checked={filters.meals.includes(meal)}
            onChange={(on) => set({ meals: toggle(filters.meals, meal, on) })}
          />
        ))}
      </Group>

      <Group legend="Условия">
        <CheckboxRow
          label="Бесплатная отмена"
          checked={filters.freeCancel}
          onChange={(freeCancel) => set({ freeCancel })}
        />
      </Group>

      {count > 0 && (
        <Button variant="outline" onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort })}>
          Сбросить фильтры
        </Button>
      )}
    </div>
  )
}
