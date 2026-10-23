import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '@/data/destinations'
import { routeCards } from '@/test/catalog'
import { createRouteFeed, pickOther } from './globeScene'
import { cardShift, type CardFit } from './cardFit'
import { Hero } from './Hero'

const routes = routeCards()
const cities = destinations.filter((d) => routes.some((route) => route.destinationId === d.id))
const prague = destinations.find((d) => d.id === 'prague')!

// hero-globe, Requirement: Пины маршрутов; Карточка маршрута на глобусе
describe('Hero in the server render', () => {
  const page = document.createElement('div')
  page.innerHTML = renderToStaticMarkup(<Hero cities={cities} routes={routes} featured={prague} />)

  // home-page, Requirement: Состав и порядок секций — Слоган
  it('titles the hero with the slogan', () => {
    expect(page.querySelector('h1')!.textContent).toBe('Отель без догадок')
  })

  it('has a pin a city with routes', () => {
    const pins = [...page.querySelectorAll('button[aria-label$="— идеи путешествий"]')].map((pin) => pin.ariaLabel)
    expect(pins).toHaveLength(cities.length)
    expect(pins).toContain('Лиссабон, Португалия — идеи путешествий')
  })

  it('shows the featured city’s route card linking to its page, with the arcs', () => {
    const link = page.querySelector('a[href="/routes/prague-culture"]')!
    expect(link.textContent).toContain('Культурный отпуск в Праге')
    expect(link.textContent).toContain('≈')
    expect(page.textContent).toContain('Маршрут · Прага')
    expect(page.querySelectorAll('svg g').length).toBeGreaterThan(0)
  })

  // hero-globe, Requirement: Карточка маршрута на глобусе — Длинное название
  it('keeps the route card to its old maximum width and cuts a long title with an ellipsis', () => {
    const link = page.querySelector('a[href="/routes/prague-culture"]')!
    const card = link.closest('[class*="max-w-"]')!
    expect(card.classList).toContain('max-w-[min(26rem,calc(100vw-2*var(--page-x)))]')
    expect(card.classList).toContain('md:max-w-[min(26rem,calc(50vw-40px))]')
    expect(link.querySelector('span')!.classList).toContain('truncate')
  })

  // hero-globe, Requirement: Карточка маршрута на глобусе — Телефон
  it('keeps the card inside the assistant window on a phone, whatever the pin', () => {
    // Window 22–338 px, card 267 px wide, globe 600 px wide from -120 px.
    const fit: CardFit = { globeLeft: -120, globeWidth: 600, winLeft: 22, winRight: 338, cardWidth: 267, phone: true }
    for (const x of [0, 20, 50, 67, 80, 100]) {
      const left = fit.globeLeft + (x / 100) * fit.globeWidth - fit.cardWidth / 2 + cardShift(fit, x)
      expect(left).toBeGreaterThanOrEqual(fit.winLeft)
      expect(left + fit.cardWidth).toBeLessThanOrEqual(fit.winRight)
    }
    expect(cardShift({ ...fit, phone: false }, 100)).toBe(0)
    expect(cardShift(null, 50)).toBe(0)
  })

  it('shows no card without routes', () => {
    const empty = renderToStaticMarkup(<Hero cities={[]} routes={[]} featured={prague} />)
    expect(empty).not.toContain('href="/routes/')
  })
})

describe('createRouteFeed', () => {
  it('cycles the city’s routes and lists them all', () => {
    const feed = createRouteFeed(routes)
    expect(feed.all('lisbon').map((route) => route.id)).toEqual(['lisbon-student', 'lisbon-workation'])
    expect([feed.next('lisbon')?.id, feed.next('lisbon')?.id, feed.next('lisbon')?.id]).toEqual([
      'lisbon-student',
      'lisbon-workation',
      'lisbon-student',
    ])
    expect(feed.has('paris')).toBe(false)
  })
})

describe('pickOther', () => {
  const ideas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('picks by the random number', () => {
    expect(pickOther(ideas, undefined, () => 0)?.id).toBe('a')
    expect(pickOther(ideas, undefined, () => 0.99)?.id).toBe('c')
  })

  it('skips the previous idea while there is a choice', () => {
    for (const r of [0, 0.4, 0.99]) expect(pickOther(ideas, 'a', () => r)?.id).not.toBe('a')
    expect(pickOther([{ id: 'a' }], 'a', () => 0.5)?.id).toBe('a')
    expect(pickOther([], 'a')).toBeUndefined()
  })
})

// hero-globe, Requirement: Пины маршрутов
describe('Hero in the browser', () => {
  let frames: FrameRequestCallback[] = []
  let clock = 0
  let reducedMotion = false

  beforeEach(() => {
    frames = []
    clock = 0
    reducedMotion = false
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe() {
          this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
        }
        disconnect() {}
      },
    )
    window.matchMedia = ((query: string) => ({ matches: reducedMotion, media: query })) as typeof window.matchMedia
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    // jsdom has no Web Animations: the card's entrance is a no-op.
    Element.prototype.animate ??= () => ({}) as Animation
  })
  afterEach(() => vi.restoreAllMocks())

  const setup = () => {
    const user = userEvent.setup()
    render(<Hero cities={cities} routes={routes} featured={prague} />)
    return user
  }
  const cardLinks = () => document.querySelectorAll<HTMLAnchorElement>('a[href^="/routes/"]')

  it('opens one idea of a city with one route', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Прага, Чехия — идеи путешествий' }))
    expect([...cardLinks()].map((a) => a.getAttribute('href'))).toEqual(['/routes/prague-culture'])
  })

  it('shows another idea when the pin of a city with two routes opens again', async () => {
    const user = setup()
    const lisbon = screen.getByRole('button', { name: 'Лиссабон, Португалия — идеи путешествий' })
    await user.click(lisbon)
    expect(cardLinks()).toHaveLength(1)
    const first = cardLinks()[0].getAttribute('href')
    await user.click(lisbon)
    await user.click(lisbon)
    expect(cardLinks()).toHaveLength(1)
    expect(cardLinks()[0].getAttribute('href')).not.toBe(first)
    expect(cardLinks()[0].getAttribute('href')).toMatch(/^\/routes\/lisbon-/)
  })
})
