import { isValidElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RootLayout from './layout'

vi.mock('../lib/db/catalog', () => ({ loadDestinations: async () => [] }))

// site-header, Requirement: Оформление шапки — Главная
describe('RootLayout', () => {
  it('turns the root background lime under the home hero, the page background elsewhere', async () => {
    const html = (await RootLayout({ children: null, modal: null })) as ReactElement<{ className: string }>
    expect(isValidElement(html)).toBe(true)
    expect(html.props.className.split(' ')).toEqual(['has-[#hero-title]:bg-brand'])
  })

  // site-header, Requirement: Оформление шапки — Серверный HTML главной
  it('makes the body the group the header reads the page content through', async () => {
    const html = (await RootLayout({ children: null, modal: null })) as ReactElement<{
      children: ReactElement<{ className: string }>
    }>
    expect(html.props.children.props.className.split(' ')).toContain('group/page')
  })
})
