import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchResultsFallback, SearchResultsPage } from '../../components/SearchResultsPage/SearchResultsPage'

export const metadata: Metadata = { title: 'Результаты поиска' }

// Prerendered without a query: the page reads it from the URL in the browser.
export default function Page() {
  return (
    <Suspense fallback={<SearchResultsFallback />}>
      <SearchResultsPage />
    </Suspense>
  )
}
