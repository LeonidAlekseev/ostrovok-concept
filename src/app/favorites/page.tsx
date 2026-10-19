import type { Metadata } from 'next'
import { FavoritesPage } from '@/components/Favorites/FavoritesPage'

export const metadata: Metadata = { title: 'Избранное — Островок!' }

export default function Page() {
  return <FavoritesPage />
}
