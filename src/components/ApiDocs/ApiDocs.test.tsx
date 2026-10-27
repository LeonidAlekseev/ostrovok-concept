import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import hotelsIds from '@/lib/openapi/examples/hotels-ids.json'
import noiseMap from '@/lib/openapi/examples/noise-map.json'
import view from '@/lib/openapi/examples/view.json'
import type { GeoAnswer } from './geo'
import { ApiDocs } from './ApiDocs'

// Scalar and MapLibre need a real browser: the reference sends one answer of «Try it», the map names what it shows.
vi.mock('./Reference', () => ({
  default: ({ onResponse }: { onResponse: (url: string, response: Response) => void }) => (
    <button
      type="button"
      onClick={() => onResponse(`${window.location.origin}/api/hotels/ota-9096882/noise-map`, Response.json(noiseMap))}
    >
      Отправить
    </button>
  ),
}))
vi.mock('./ResponseMap', () => ({
  default: ({ answer }: { answer: GeoAnswer }) => (
    <p>
      На карте: {answer.title}, {answer.features.length}
    </p>
  ),
}))

/** The part of /api/openapi.json the page reads: a geo route with its example. */
const document = {
  paths: {
    '/api/hotels/{hotelId}/view': {
      get: {
        summary: 'Вид из отеля',
        'x-geo': true,
        parameters: [{ name: 'hotelId', in: 'path', example: 'ota-9096882' }],
        responses: {
          200: { content: { 'application/json': { examples: { real: { summary: 'ota-9096882', value: view } } } } },
        },
      },
    },
  },
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/openapi.json' ? Response.json(document) : Response.json(hotelsIds.response),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('ApiDocs', () => {
  // api-docs, Requirement: Страница документации, Scenario: Try it с картой
  it('shows the answer of a geo request on the map, with the hotel', async () => {
    const user = userEvent.setup()
    render(<ApiDocs />)
    await user.click(await screen.findByRole('button', { name: 'Отправить' }))
    const panel = await screen.findByRole('region', { name: 'Карта ответа' })
    expect(panel.textContent).toContain('200 · /api/hotels/ota-9096882/noise-map')
    // The noise and the hotel's marker from its point.
    expect(await screen.findByText(`На карте: Шум вокруг отеля, ${noiseMap.map.features.length + 1}`)).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/hotels?ids=ota-9096882')
    await user.click(screen.getByRole('button', { name: 'Закрыть карту' }))
    expect(screen.queryByRole('region', { name: 'Карта ответа' })).toBeNull()
  })

  // api-docs, Requirement: Страница документации, Scenario: Пример на карте
  it('shows an example of the document on the map without a request', async () => {
    const user = userEvent.setup()
    render(<ApiDocs />)
    await user.click(await screen.findByRole('button', { name: 'Вид из отеля · ota-9096882' }))
    await waitFor(() => expect(screen.getByText(/На карте: Вид из отеля/)).toBeTruthy())
    expect(screen.getByText('Пример · ota-9096882')).toBeTruthy()
  })

  it('links both documents', () => {
    render(<ApiDocs />)
    expect(screen.getByRole('heading', { level: 1, name: 'API' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '/api/openapi.json' }).getAttribute('href')).toBe('/api/openapi.json')
    expect(screen.getByRole('link', { name: '/api/openapi/supabase.json' })).toBeTruthy()
  })
})
