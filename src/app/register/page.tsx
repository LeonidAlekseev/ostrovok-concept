import type { Metadata } from 'next'
import { AuthPage } from '@/components/Auth/AuthView'

export const metadata: Metadata = { title: 'Регистрация — Островок!' }

export default function Page() {
  return <AuthPage mode="register" />
}
