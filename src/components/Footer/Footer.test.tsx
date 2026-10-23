import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

describe('Footer', () => {
  it('links the support and legal pages', () => {
    render(<Footer />)
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href('Поддержка')).toBe('/help')
    expect(href('Условия использования')).toBe('/legal/terms')
    expect(href('Конфиденциальность')).toBe('/legal/privacy')
    expect(href('Cookie')).toBe('/legal/cookies')
  })

  it('names the service, the year and marks the demo', () => {
    render(<Footer />)
    const text = screen.getByRole('contentinfo').textContent
    expect(text).toContain(`© ${new Date().getFullYear()} О!Погнали`)
    expect(text).toContain('Демо-проект: бронирования не настоящие')
  })

  // app-shell, Requirement: Оформление подвала
  it('is flat: page background, a line on top, no rounding', () => {
    render(<Footer />)
    const { className } = screen.getByRole('contentinfo')
    expect(className).toMatch(/\bborder-t\b/)
    expect(className).toMatch(/\bbg-background\b/)
    expect(className).not.toMatch(/rounded|shadow/)
  })
})
