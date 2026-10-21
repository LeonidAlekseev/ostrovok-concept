import type { Metadata } from 'next'
import { TripsPage } from '@/components/Trips/TripsPage'

export const metadata: Metadata = { title: 'Мои поездки' }

export default function Page() {
  return <TripsPage />
}
