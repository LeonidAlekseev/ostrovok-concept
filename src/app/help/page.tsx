import type { Metadata } from 'next'
import { HelpPage } from '@/components/HelpPage/HelpPage'

export const metadata: Metadata = { title: 'Поддержка' }

export default function Page() {
  return <HelpPage />
}
