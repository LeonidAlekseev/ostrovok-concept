import type { Metadata } from 'next'
import { ConfirmationPage } from '@/components/BookingConfirmation/ConfirmationPage'

export const metadata: Metadata = { title: 'Бронирование подтверждено' }

export default function Page() {
  return <ConfirmationPage />
}
