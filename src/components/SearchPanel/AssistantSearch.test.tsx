import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newHotels } from '../../lib/catalogGenerator'
import { routeCards } from '../../test/catalog'
import { AssistantSearch } from './AssistantSearch'

const fetchMock = vi.fn<typeof fetch>()

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function renderAssistant() {
  vi.stubGlobal('fetch', fetchMock)
  render(<AssistantSearch newHotels={newHotels} routes={routeCards()} onChoose={() => ({})} />)
  return userEvent.setup()
}

const log = () => screen.getByRole('list', { name: 'Диалог с ассистентом' })

// assistant-search, Requirement: Разбор пожелания
describe('AssistantSearch with the model', () => {
  it('shows what the model understood from a free phrase (Scenario: Свободная фраза)', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ brief: { vibe: 'sea', budget: 40000 }, reply: 'Тёплое море!', source: 'model' }),
    )
    const user = renderAssistant()

    await user.type(screen.getByLabelText('Опишите поездку'), 'хочу туда, где тепло и можно поплавать с маской{Enter}')

    expect(
      await screen.findByText('Записал: море · до 40 000 ₽. Когда планируете поехать?', {}, { timeout: 2000 }),
    ).toBeTruthy()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/assistant')
    expect(JSON.parse(init?.body as string)).toEqual({
      messages: [{ role: 'user', text: 'хочу туда, где тепло и можно поплавать с маской' }],
      brief: {},
    })
  })

  it('sends the dialog so far and the brief with the next message', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ brief: { vibe: 'sea' }, source: 'model' }))
      .mockResolvedValueOnce(Response.json({ brief: { vibe: 'sea', when: 9 }, source: 'model' }))
    const user = renderAssistant()

    await user.type(screen.getByLabelText('Опишите поездку'), 'к морю{Enter}')
    await screen.findByText(/Когда планируете поехать/, {}, { timeout: 2000 })
    await user.type(screen.getByLabelText('Опишите поездку'), 'осенью, в октябре{Enter}')
    await screen.findByText(/С кем едете/, {}, { timeout: 2000 })

    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      messages: [
        { role: 'user', text: 'к морю' },
        { role: 'assistant', text: 'Записал: море. Когда планируете поехать?' },
        { role: 'user', text: 'осенью, в октябре' },
      ],
      brief: { vibe: 'sea' },
    })
  })

  it('leads with the model remark when nothing is understood yet', async () => {
    fetchMock.mockResolvedValue(Response.json({ brief: {}, reply: 'Привет!', source: 'model' }))
    const user = renderAssistant()

    await user.type(screen.getByLabelText('Опишите поездку'), 'привет{Enter}')

    expect(await screen.findByText(/^Привет! Какое настроение у поездки\?/, {}, { timeout: 2000 })).toBeTruthy()
  })

  it('reads the wish with the rules when the route fails, without an error (Scenario: Модель недоступна)', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 429 }))
    const user = renderAssistant()

    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море в октябре, бюджет до 70 000 ₽{Enter}')

    expect(
      await screen.findByText(
        'Записал: море · в октябре · до 70 000 ₽. С кем едете? Так я подберу номер и формат отдыха.',
        {},
        { timeout: 2000 },
      ),
    ).toBeTruthy()
    expect(log().textContent).not.toMatch(/ошибк/i)
  })

  it('falls back to the rules when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = renderAssistant()

    await user.type(screen.getByLabelText('Опишите поездку'), 'в горы{Enter}')

    expect(await screen.findByText('Записал: горы. Когда планируете поехать?', {}, { timeout: 2000 })).toBeTruthy()
  })

  it('drops the pending reply on «Заново»', async () => {
    let answer!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const user = renderAssistant()

    await user.type(screen.getByLabelText('Опишите поездку'), 'в горы{Enter}')
    await user.click(screen.getByRole('button', { name: 'Заново' }))
    answer(Response.json({ brief: { vibe: 'mountains' }, source: 'model' }))
    await new Promise((resolve) => setTimeout(resolve, 900))

    expect(screen.queryByRole('list', { name: 'Диалог с ассистентом' })).toBeNull()
    expect(screen.getByText('О каком путешествии вы мечтаете?')).toBeTruthy()
  })

  it('caps the message at 500 characters', () => {
    renderAssistant()
    expect(screen.getByLabelText('Опишите поездку').getAttribute('maxlength')).toBe('500')
  })
})

// assistant-search, Requirement: Готовый маршрут в плане; routes, Requirement: Лучший готовый маршрут
describe('AssistantSearch ready-made route', () => {
  const complete = { destinationId: 'lisbon', when: 9, party: 'solo' }
  const readyLink = async () =>
    within(await screen.findByRole('region', { name: 'Готовый маршрут' }, { timeout: 2000 })).getByRole('link')

  it('shows the route the search by meaning found (a mock model)', async () => {
    fetchMock.mockResolvedValue(Response.json({ brief: complete, source: 'model', routeId: 'tokyo-culture' }))
    const user = renderAssistant()
    await user.type(screen.getByLabelText('Опишите поездку'), 'Лиссабон в октябре, один{Enter}')
    expect((await readyLink()).getAttribute('href')).toBe('/routes/tokyo-culture')
  })

  it('without the search by meaning, picks the persona’s route in the plan’s city (Scenario: Поиск по смыслу недоступен)', async () => {
    fetchMock.mockResolvedValue(Response.json({ brief: complete, source: 'rules' }))
    const user = renderAssistant()
    await user.type(screen.getByLabelText('Опишите поездку'), 'Поработать с ноутбуком в Лиссабоне{Enter}')
    expect((await readyLink()).getAttribute('href')).toBe('/routes/lisbon-workation')
    expect(log().textContent).not.toMatch(/ошибк/i)
  })
})
