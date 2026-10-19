import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage/LegalPage'
import { terms } from '@/data/legal'

export const metadata: Metadata = { title: 'Условия использования — Островок!' }

export default function Page() {
  return <LegalPage document={terms} />
}
