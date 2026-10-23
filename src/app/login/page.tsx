import type { Metadata } from 'next'
import { AuthPage } from '@/components/Auth/AuthView'

export const metadata: Metadata = { title: 'Вход' }

export default function Page() {
  return <AuthPage mode="login" />
}
