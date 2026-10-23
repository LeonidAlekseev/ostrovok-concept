import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cookies, privacy, terms } from '@/data/legal'
import { LegalPage } from './LegalPage'

describe.each([terms, privacy, cookies])('legal page $slug', (document) => {
  it('shows the title, date and demo note', () => {
    render(<LegalPage document={document} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(document.title)
    expect(screen.getByText(`Обновлено: ${document.updated}`)).toBeTruthy()
    expect(screen.getByText('Демонстрационный шаблон, не является юридическим документом')).toBeTruthy()
  })

  it('links every contents entry to a section with that heading', () => {
    const { container } = render(<LegalPage document={document} />)
    const links = within(screen.getByRole('navigation', { name: 'Содержание' })).getAllByRole('link')
    expect(links).toHaveLength(document.sections.length)
    for (const [i, link] of links.entries()) {
      const section = container.querySelector(link.getAttribute('href')!)
      expect(section?.querySelector('h2')?.textContent).toBe(document.sections[i].title)
    }
  })
})

describe('cookies page', () => {
  it('lists the session cookie and the storage keys and says there are no third-party cookies', () => {
    render(<LegalPage document={cookies} />)
    for (const key of ['sb-<проект>-auth-token', 'ostrovok:v1:favorites', 'ostrovok:v1:bookings'])
      expect(screen.getByText(key)).toBeTruthy()
    expect(screen.getByText(/Сторонних cookie и аналитики на сайте нет/)).toBeTruthy()
  })
})
