import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '@/data/destinations'
import { newHotels } from '@/lib/catalogGenerator'
import { createHotelFeed, pickOther } from './globeScene'
import { cardShift, type CardFit } from './cardFit'
import { Hero } from './Hero'
import { NARROW, setScreen } from '../../test/screen'

const hotels = newHotels
const cities = destinations.filter((d) => hotels.some((hotel) => hotel.destinationId === d.id))
const prague = destinations.find((d) => d.id === 'prague')!
const [firstOfPrague] = hotels.filter((h) => h.destinationId === 'prague')

// hero-globe, Requirement: Пины городов с отелями; Карточка отеля на глобусе
describe('Hero in the server render', () => {
  const page = document.createElement('div')
  page.innerHTML = renderToStaticMarkup(<Hero cities={cities} hotels={hotels} featured={prague} />)

  // home-page, Requirement: Состав и порядок секций — Слоган
  it('titles the hero with the slogan', () => {
    expect(page.querySelector('h1')!.textContent).toBe('За гранью поиска')
  })

  it('has a pin a city with new hotels', () => {
    const pins = [...page.querySelectorAll('button[aria-label$="— отели"]')].map((pin) => pin.ariaLabel)
    expect(pins).toHaveLength(cities.length)
    expect(pins).toContain('Лиссабон, Португалия — отели')
  })

  it('shows the featured city’s new hotel card linking to its page, without arcs', () => {
    const link = page.querySelector(`a[href="/hotels/${firstOfPrague.id}?adults=2&rooms=1"]`)!
    expect(link.textContent).toContain(firstOfPrague.name)
    expect(link.textContent).toMatch(/Прага · от [\d\s]+₽ за ночь/)
    expect(page.textContent).toContain('Новый отель · Прага')
    expect(page.querySelector('path[d^="M "]')).toBeNull()
    expect(page.querySelector('a[href^="/routes/"]')).toBeNull()
  })

  // hero-globe, Requirement: Карточка отеля на глобусе — Отель без пометки «новый»
  it('labels a hotel without the «new» mark as a plain hotel', () => {
    const plain = { ...firstOfPrague, isNew: false }
    const plainPage = document.createElement('div')
    plainPage.innerHTML = renderToStaticMarkup(<Hero cities={cities} hotels={[plain]} featured={prague} />)
    expect(plainPage.textContent).toContain('Отель · Прага')
    expect(plainPage.textContent).not.toContain('Новый отель')
  })

  // hero-globe, Requirement: Ширина карточки отеля — Длинное название
  it('keeps the hotel card to its old maximum width and cuts a long name with an ellipsis', () => {
    const link = page.querySelector('a[href^="/hotels/"]')!
    const card = link.closest('[class*="max-w-"]')!
    expect(card.classList).toContain('max-w-[min(26rem,calc(100vw-2*var(--page-x)))]')
    expect(card.classList).toContain('md:max-w-[min(26rem,calc(50vw-40px))]')
    expect(link.querySelector('span')!.classList).toContain('truncate')
  })

  // hero-globe, Requirement: Ширина карточки отеля — Телефон
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

  it('shows no card without new hotels', () => {
    const empty = renderToStaticMarkup(<Hero cities={[]} hotels={[]} featured={prague} />)
    expect(empty).not.toContain('href="/hotels/')
  })
})

describe('createHotelFeed', () => {
  it('cycles the city’s hotels and lists them all', () => {
    const feed = createHotelFeed(hotels)
    const lisbon = hotels.filter((h) => h.destinationId === 'lisbon').map((h) => h.id)
    expect(feed.all('lisbon').map((hotel) => hotel.id)).toEqual(lisbon)
    expect(Array.from({ length: lisbon.length + 1 }, () => feed.next('lisbon')?.id)).toEqual([...lisbon, lisbon[0]])
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

// hero-globe, Requirement: Пины городов с отелями
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
    // The width is a phone's: the card fit (cardShift) then runs as it always did in these tests.
    setScreen(NARROW, { reducedMotion })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    // jsdom has no Web Animations: the card's entrance is a no-op.
    Element.prototype.animate ??= () => ({}) as Animation
  })
  afterEach(() => vi.restoreAllMocks())

  const setup = () => {
    const user = userEvent.setup()
    render(<Hero cities={cities} hotels={hotels} featured={prague} />)
    return user
  }
  const cardLinks = () => document.querySelectorAll<HTMLAnchorElement>('a[href^="/hotels/"]')

  it('opens one new hotel of the city', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Прага, Чехия — отели' }))
    expect(cardLinks()).toHaveLength(1)
    expect(cardLinks()[0].getAttribute('href')).toMatch(/^\/hotels\/prague-[a-z0-9-]+\?adults=2&rooms=1$/)
  })

  it('shows another hotel when the pin of a city with three new hotels opens again', async () => {
    const user = setup()
    const lisbon = screen.getByRole('button', { name: 'Лиссабон, Португалия — отели' })
    await user.click(lisbon)
    expect(cardLinks()).toHaveLength(1)
    const first = cardLinks()[0].getAttribute('href')
    await user.click(lisbon)
    await user.click(lisbon)
    expect(cardLinks()).toHaveLength(1)
    expect(cardLinks()[0].getAttribute('href')).not.toBe(first)
    expect(cardLinks()[0].getAttribute('href')).toMatch(/^\/hotels\/lisbon-/)
  })
})
