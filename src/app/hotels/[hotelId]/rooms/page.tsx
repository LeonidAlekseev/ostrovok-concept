import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RatesPage } from '@/components/RatesPage/RatesPage'
import { loadHotel, loadHotelSummaries } from '@/lib/catalogSource'

type Props = { params: Promise<{ hotelId: string }> }

export function generateStaticParams() {
  return loadHotelSummaries().map(({ id }) => ({ hotelId: id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hotel = loadHotel((await params).hotelId)
  return { title: hotel ? `Номера и тарифы: ${hotel.name}` : 'Страница не найдена' }
}

export default async function Page({ params }: Props) {
  const hotel = loadHotel((await params).hotelId)
  if (!hotel) notFound()
  return <RatesPage hotel={hotel} />
}
