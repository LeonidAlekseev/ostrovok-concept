import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RoutePage } from '@/components/RoutePage/RoutePage'
import { loadRoute } from '@/lib/db/routes'

type Props = { params: Promise<{ routeId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadRoute((await params).routeId)
  return { title: loaded ? loaded.route.title : 'Страница не найдена' }
}

export default async function Page({ params }: Props) {
  const loaded = await loadRoute((await params).routeId)
  if (!loaded) notFound()
  return <RoutePage route={loaded.route} hotels={loaded.hotels} />
}
