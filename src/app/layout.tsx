import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/onest'
import '@fontsource/caveat/600.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Островок! — бронирование отелей',
  description: 'Островок! — найдите отель для следующего путешествия',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png', sizes: '128x128' },
    ],
    apple: '/favicon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // --brand-lime from globals.css: metadata needs a literal.
  themeColor: '#a5e87b',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
