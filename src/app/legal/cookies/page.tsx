import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage/LegalPage'
import { cookies } from '@/data/legal'

export const metadata: Metadata = { title: 'Cookie и локальное хранилище' }

export default function Page() {
  return <LegalPage document={cookies} />
}
