import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RatesPage } from '@/components/RatesPage/RatesPage'
import { getHotel, hotels } from '@/lib/catalog'

type Props = { params: Promise<{ hotelId: string }> }

export function generateStaticParams() {
  return hotels.map(({ id }) => ({ hotelId: id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hotel = getHotel((await params).hotelId)
  return { title: hotel ? `Номера и тарифы: ${hotel.name} — Островок!` : 'Страница не найдена — Островок!' }
}

export default async function Page({ params }: Props) {
  const hotel = getHotel((await params).hotelId)
  if (!hotel) notFound()
  return <RatesPage hotel={hotel} />
}
