/**
 * Scrolls the page to a section and moves focus there. A button rather than a `#hash` link: a hash would add an
 * entry to the history, and "Назад" would walk the sections instead of leaving the hotel.
 */
export function goToSection(id: string) {
  const section = document.getElementById(id)
  if (!section) return
  section.scrollIntoView({ block: 'start' })
  section.focus({ preventScroll: true })
}
