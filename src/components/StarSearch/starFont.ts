import { Playfair_Display } from 'next/font/google'

/**
 * The golden antiqua of the star search: titles and labels of the window and the video. One weight; not
 * preloaded, the window opens on demand and the font comes with it.
 */
export const starSerif = Playfair_Display({
  subsets: ['cyrillic', 'latin'],
  weight: '600',
  display: 'swap',
  preload: false,
  variable: '--font-star-serif',
})
