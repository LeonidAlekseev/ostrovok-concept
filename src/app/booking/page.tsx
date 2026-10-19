import type { Metadata } from 'next'
import { BookingPage } from '@/components/BookingPage/BookingPage'

export const metadata: Metadata = { title: 'Оформление бронирования — Островок!' }

export default function Page() {
  return <BookingPage />
}
