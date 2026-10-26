'use client'

import { useHotelSearch } from '@/hooks/useHotelSearch'
import type { HotelSummary } from '@/lib/catalog'
import { AssistantSearch } from './AssistantSearch'

interface Props {
  /** The "recently added" hotels the assistant suggests. */
  newHotels: readonly HotelSummary[]
}

/**
 * The page `/assistant` (and `/assistant/<id>`): Eval's chats on the plain page background. From `lg` they take the
 * whole screen, without the site's header and footer (src/app/layout.tsx hides them by `data-assistant-app`); on
 * phones the list keeps the header, a chat takes the screen.
 */
export function AssistantPage({ newHotels }: Props) {
  // The assistant's choice opens the results page, whose manual form shows it.
  const { searchFor } = useHotelSearch()
  return (
    <main className="flex w-full flex-1 flex-col px-(--page-x) pt-2 pb-6 has-data-[assistant-app=chat]:p-0 lg:h-dvh lg:flex-none lg:p-4 lg:has-data-[assistant-app=chat]:p-4">
      <h1 className="sr-only">Спросить Эвал</h1>
      <AssistantSearch newHotels={newHotels} onChoose={searchFor} />
    </main>
  )
}
