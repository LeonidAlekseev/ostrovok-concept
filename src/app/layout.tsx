import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { CatalogProvider } from '../components/Catalog/CatalogProvider'
import { Footer } from '../components/Footer/Footer'
import { Header } from '../components/Header/Header'
import '@fontsource-variable/onest'
import '@fontsource/caveat/600.css'
import { loadDestinations } from '../lib/db/catalog'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'О!Погнали — бронирование отелей',
    template: '%s — О!Погнали',
  },
  description: 'О!Погнали — найдите отель для следующего путешествия',
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

// Every page reads the catalogue (the layout: the destinations); the pages are rebuilt in the background
// once an hour, as long as the catalogue cache lives (CATALOG_LIFETIME), or after POST /api/revalidate.
export const revalidate = 3600

export default async function RootLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  const destinations = await loadDestinations()
  return (
    <html lang="ru">
      {/* Each page renders its own `main`; the footer sits at the bottom of short pages. */}
      <body className="flex min-h-dvh flex-col">
        <CatalogProvider destinations={destinations}>
          <Header />
          {children}
          {modal}
          <Footer />
        </CatalogProvider>
      </body>
    </html>
  )
}
