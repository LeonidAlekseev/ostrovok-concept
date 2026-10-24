'use client'

import { useHotelSearch } from '@/hooks/useHotelSearch'
import type { HotelSummary } from '@/lib/catalog'
import { glassPanel } from '../SearchPanel/glass'
import { AssistantSearch } from './AssistantSearch'

interface Props {
  /** The "recently added" hotels the assistant suggests. */
  newHotels: readonly HotelSummary[]
}

/** The page `/assistant`: Eval's chat in its glass window across the page, on the plain page background. */
export function AssistantPage({ newHotels }: Props) {
  // The assistant's choice opens the results page, whose manual form shows it.
  const { searchFor } = useHotelSearch()
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col px-(--page-x) py-[clamp(12px,3vw,32px)]">
      <h1 className="sr-only">Спросить Эвал</h1>
      {/* Children that bleed to the window edge (scrolling chips) read --pad. */}
      <div className={`${glassPanel} rounded-[clamp(24px,6vw,36px)] p-(--pad) [--pad:clamp(14px,3.8vw,28px)]`}>
        <AssistantSearch newHotels={newHotels} onChoose={searchFor} />
      </div>
    </main>
  )
}
