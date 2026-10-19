import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage/LegalPage'
import { privacy } from '@/data/legal'

export const metadata: Metadata = { title: 'Политика конфиденциальности — Островок!' }

export default function Page() {
  return <LegalPage document={privacy} />
}
