import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { destinations } from '@/data/destinations'
import { routeCards } from '@/test/catalog'
import { createRouteFeed } from './globeScene'
import { Hero } from './Hero'

const routes = routeCards()
const cities = destinations.filter((d) => routes.some((route) => route.destinationId === d.id))
const prague = destinations.find((d) => d.id === 'prague')!

// hero-globe, Requirement: Пины маршрутов; Карточка маршрута на глобусе
describe('Hero in the server render', () => {
  const page = document.createElement('div')
  page.innerHTML = renderToStaticMarkup(<Hero cities={cities} routes={routes} featured={prague} />)

  it('has a pin a city with routes', () => {
    const pins = [...page.querySelectorAll('button[aria-label$="— маршруты"]')].map((pin) => pin.ariaLabel)
    expect(pins).toHaveLength(cities.length)
    expect(pins).toContain('Лиссабон, Португалия — маршруты')
  })

  it('shows the featured city’s route card linking to its page, with the arcs', () => {
    const link = page.querySelector('a[href="/routes/prague-culture"]')!
    expect(link.textContent).toContain('Культурный отпуск в Праге')
    expect(link.textContent).toContain('≈')
    expect(page.textContent).toContain('Маршрут · Прага')
    expect(page.querySelectorAll('svg g').length).toBeGreaterThan(0)
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
