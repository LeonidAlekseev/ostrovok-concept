import type { Metadata } from 'next'
import { ApiDocs } from '@/components/ApiDocs/ApiDocs'

export const metadata: Metadata = {
  title: 'API',
  description: 'Интерактивная документация API сайта и Supabase: OpenAPI 3.1, запросы и карта гео-ответов',
}

export default function Page() {
  return <ApiDocs />
}
