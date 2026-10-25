import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { SharedChat } from '@/components/AssistantPage/SharedChat'
import { loadShare } from '@/lib/db/shares'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection()
  const share = await loadShare((await params).id)
  // A private link: not for the search engines.
  return { title: share ? `${share.title || 'Чат с Эвалом'}` : 'Страница не найдена', robots: { index: false } }
}

/** A chat someone shared: read-only, at request time (a link made a moment ago opens at once). */
export default async function Page({ params }: Props) {
  await connection()
  const share = await loadShare((await params).id)
  if (!share) notFound()
  return <SharedChat share={share} />
}
