import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/onest'
import '@fontsource/caveat/600.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Островок! — бронирование отелей',
  description: 'Островок! — найдите отель для следующего путешествия',
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Browser chrome and overscroll match the page, not the green hero (it would show below the footer).
  themeColor: '#f2f4f7',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
