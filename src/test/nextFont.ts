/** Stand-in for next/font/google in tests: every font is a family name with empty class names. */
const font = (name: string) => () => ({
  className: '',
  variable: '',
  style: { fontFamily: `'${name.replaceAll('_', ' ')}', serif` },
})

export const Playfair_Display = font('Playfair_Display')
