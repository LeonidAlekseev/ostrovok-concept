export interface CardFit {
  globeLeft: number
  globeWidth: number
  winLeft: number
  winRight: number
  cardWidth: number
  phone: boolean
}

/** Pixels to move the card sideways so that, centred under its pin, it stays inside the assistant's window (phones). */
export function cardShift(fit: CardFit | null, x: number) {
  if (!fit?.phone || !Number.isFinite(x)) return 0
  const left = fit.globeLeft + (x / 100) * fit.globeWidth - fit.cardWidth / 2
  const fitted = Math.max(fit.winLeft, Math.min(left, fit.winRight - fit.cardWidth))
  return fitted - left
}
