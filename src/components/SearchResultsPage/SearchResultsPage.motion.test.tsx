import { STAY, open, results } from './searchResultsTestKit'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// search-results-page, Requirement: Прокрутка к результатам при смене страницы
describe('SearchResultsPage scroll after a page change', () => {
  const EUROPE = `scenario=europe&${STAY}`
  const pagination = () => screen.getByRole('navigation', { name: 'Страницы результатов' })
  const heading = () => screen.getByRole('heading', { name: /^Найдено \d+/ })

  // jsdom has no scrollIntoView: the spy stands on the prototype for the test and the property is put back after it.
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
  let scrollIntoView: ReturnType<typeof vi.fn>
  beforeEach(() => {
    scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
      writable: true,
    })
  })
  afterEach(() => {
    if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original)
    else delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  // search-results-page, Requirement: Прокрутка к результатам при смене страницы, Scenario: Обычный режим
  it('scrolls the heading to the top smoothly and focuses it', async () => {
    const user = userEvent.setup()
    open(EUROPE)
    await results()

    await user.click(within(pagination()).getByRole('link', { name: 'Страница 2' }))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(scrollIntoView.mock.contexts[0]).toBe(heading())
    await waitFor(() => expect(document.activeElement).toBe(heading()))
  })

  // search-results-page, Requirement: Прокрутка к результатам при смене страницы, Scenario: Reduced motion
  it('scrolls the heading at once with reduced motion and focuses it', async () => {
    const user = userEvent.setup()
    open(EUROPE, { reducedMotion: true })
    await results()

    await user.click(within(pagination()).getByRole('link', { name: 'Страница 2' }))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(scrollIntoView.mock.contexts[0]).toBe(heading())
    await waitFor(() => expect(document.activeElement).toBe(heading()))
  })
})
