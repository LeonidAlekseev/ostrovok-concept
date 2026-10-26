import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HotelPage } from '@/components/HotelPage/HotelPage'
import { loadHotel, loadHotelSummaries } from '@/lib/db/catalog'
import { loadHotelDetails } from '@/lib/db/hotelDetails'

type Props = { params: Promise<{ hotelId: string }> }

// The hotels known at build time are prerendered; one added to the database later is rendered on its first
// request and cached as well (dynamicParams), with no rebuild.
export async function generateStaticParams() {
  return (await loadHotelSummaries()).map(({ id }) => ({ hotelId: id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hotel = await loadHotel((await params).hotelId)
  return { title: hotel ? hotel.name : 'Страница не найдена' }
}

export default async function Page({ params }: Props) {
  const hotel = await loadHotel((await params).hotelId)
  if (!hotel) notFound()
  return <HotelPage hotel={hotel} details={await loadHotelDetails(hotel.id)} />
}
