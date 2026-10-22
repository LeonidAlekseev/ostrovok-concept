import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RatesPage } from '@/components/RatesPage/RatesPage'
import { loadHotel, loadHotelSummaries } from '@/lib/db/catalog'

type Props = { params: Promise<{ hotelId: string }> }

// The hotels known at build time are prerendered; one added to the database later is rendered on its first
// request and cached as well (dynamicParams), with no rebuild.
export async function generateStaticParams() {
  return (await loadHotelSummaries()).map(({ id }) => ({ hotelId: id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hotel = await loadHotel((await params).hotelId)
  return { title: hotel ? `Номера и тарифы: ${hotel.name}` : 'Страница не найдена' }
}

export default async function Page({ params }: Props) {
  const hotel = await loadHotel((await params).hotelId)
  if (!hotel) notFound()
  return <RatesPage hotel={hotel} />
}
