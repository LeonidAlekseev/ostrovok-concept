import type { Metadata } from 'next'
import { connection } from 'next/server'
import { LocalSharedChat } from '@/components/AssistantPage/LocalSharedChat'
import { SharedChat } from '@/components/AssistantPage/SharedChat'
import { loadShare } from '@/lib/db/shares'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection()
  const share = await loadShare((await params).id)
  // A private link: not for the search engines.
  // A link of the standalone demo lives in the browser that made it: the server knows no title for it.
  return { title: share ? `${share.title || 'Чат с Эвалом'}` : 'Чат с Эвалом', robots: { index: false } }
}

/** A chat someone shared: read-only, at request time; in the standalone demo from the browser that shared it. */
export default async function Page({ params }: Props) {
  await connection()
  const share = await loadShare((await params).id)
  return share ? <SharedChat share={share} /> : <LocalSharedChat id={(await params).id} />
}
