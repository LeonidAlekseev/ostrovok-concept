/**
 * Scrolls the page or the hotel dialog to a section and moves focus there. A button rather than a
 * `#hash` link: in the dialog a hash would land in the search address and in its history.
 */
export function goToSection(id: string) {
  const section = document.getElementById(id)
  if (!section) return
  section.scrollIntoView({ block: 'start' })
  section.focus({ preventScroll: true })
}
