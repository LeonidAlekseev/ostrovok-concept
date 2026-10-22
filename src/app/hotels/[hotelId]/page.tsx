import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HotelPage } from '@/components/HotelPage/HotelPage'
import { loadHotel, loadHotelSummaries } from '@/lib/catalogSource'

type Props = { params: Promise<{ hotelId: string }> }

export function generateStaticParams() {
  return loadHotelSummaries().map(({ id }) => ({ hotelId: id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hotel = loadHotel((await params).hotelId)
  return { title: hotel ? hotel.name : 'Страница не найдена' }
}

export default async function Page({ params }: Props) {
  const hotel = loadHotel((await params).hotelId)
  if (!hotel) notFound()
  return <HotelPage hotel={hotel} />
}
