import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import { Footer } from '../components/Footer/Footer'
import { Header } from '../components/Header/Header'
import '@fontsource-variable/onest'
import './globals.css'

// TT Lovelies Script (one weight, so no font-semibold) cut to what the site prints: basic Latin for typed names, Russian
// letters, digits and punctuation. Built in a temporary venv (fontTools + brotli), not a project dependency:
//   pyftsubset ttloveliesscript.ttf --flavor=woff2 --layout-features='kern,liga' --output-file=lovelies-script-subset.woff2 \
//     --unicodes='U+0020-0021,U+0028-0029,U+002C-002E,U+003A-003B,U+003F,U+0030-0039,U+0041-005A,U+0061-007A,U+0401,U+0410-044F,U+0451,U+00AB,U+00BB,U+2014,U+2026,U+2116'
const hand = localFont({
  src: './fonts/lovelies-script-subset.woff2',
  variable: '--font-lovelies',
  display: 'swap',
  preload: true,
})

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
    <html lang="ru" className={hand.variable}>
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
