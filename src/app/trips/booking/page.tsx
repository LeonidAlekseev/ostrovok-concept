import type { Metadata } from 'next'
import { BookingDetailsPage } from '@/components/Trips/BookingDetailsPage'

export const metadata: Metadata = { title: 'Бронирование' }

export default function Page() {
  return <BookingDetailsPage />
}
