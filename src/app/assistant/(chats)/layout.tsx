import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AssistantPage } from '@/components/AssistantPage/AssistantPage'
import { loadNewHotels } from '@/lib/db/catalog'

export const metadata: Metadata = { title: 'Спросить Эвал' }

/**
 * `/assistant` and `/assistant/<id>` share this layout: the chats stay loaded while the address follows the open
 * chat (src/components/AssistantPage/useChatPath.ts). The pages themselves render nothing.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <AssistantPage newHotels={await loadNewHotels()} />
      {children}
    </>
  )
}
