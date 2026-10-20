import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Footer } from '../components/Footer/Footer'
import { Header } from '../components/Header/Header'
import '@fontsource-variable/onest'
import '@fontsource/great-vibes/400.css'
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

export default function RootLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <html lang="ru">
      {/* Each page renders its own `main`; the footer sits at the bottom of short pages. */}
      <body className="flex min-h-dvh flex-col">
        <Header />
        {children}
        {modal}
        <Footer />
      </body>
    </html>
  )
}
