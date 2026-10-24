import type { Metadata } from 'next'
import { AssistantPage } from '@/components/AssistantPage/AssistantPage'
import { loadNewHotels } from '@/lib/db/catalog'

export const metadata: Metadata = { title: 'Спросить Эвал' }

export default async function Page() {
  return <AssistantPage newHotels={await loadNewHotels()} />
}
