'use client'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { countRu } from '../../lib/format'
import { countFilters, NO_FILTERS, type Filters } from '../../lib/results'
import { FiltersPanel } from './FiltersPanel'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: Filters
  onChange: (filters: Filters) => void
  /** How many hotels the current filters leave. */
  total: number
  priceBounds: [number, number]
}

/** The filters on narrow screens: a bottom sheet with the sorting first and a pinned "Показать N вариантов". */
export function FiltersSheet({ open, onOpenChange, filters, onChange, total, priceBounds }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false}>
        <SheetHeader className="pb-0">
          <SheetTitle>Фильтры</SheetTitle>
          <SheetDescription className="sr-only">Сортировка и фильтры применяются сразу.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <FiltersPanel filters={filters} onChange={onChange} priceBounds={priceBounds} embedded />
        </div>
        <SheetFooter className="mt-0 flex-row border-t">
          {countFilters(filters) > 0 && (
            <Button variant="outline" onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort })}>
              Сбросить
            </Button>
          )}
          <SheetClose render={<Button className="flex-1" />}>
            Показать {countRu(total, ['вариант', 'варианта', 'вариантов'])}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
