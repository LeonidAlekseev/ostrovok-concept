import type { Metadata } from 'next'
import { HotelierPanel, pageClass } from '@/components/HotelierPanel/HotelierPanel'

export const metadata: Metadata = { title: 'Панель отельера', robots: { index: false } }

export default function Page() {
  return (
    <main className={pageClass}>
      <HotelierPanel />
    </main>
  )
}
