import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '../../data/destinations'
import { makePlan } from '../../lib/assistant'
import { CHATS_KEY } from '../../lib/assistantChats'
import { newHotels } from '../../lib/catalogGenerator'
import { DIALOG_KEY } from '../../lib/assistantDialog'
import { todayIso } from '../../lib/dates'
import { AssistantSearch } from './AssistantSearch'

const fetchMock = vi.fn<typeof fetch>()
const { failPlan } = vi.hoisted(() => ({ failPlan: { once: false } }))

// A plan that fails once stands in for an unexpected error of the answer (Requirement: Чат для долгих диалогов).
vi.mock('../../lib/assistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/assistant')>()
  return {
    ...actual,
    makePlan: (...args: Parameters<typeof actual.makePlan>) => {
      if (failPlan.once) {
        failPlan.once = false
        throw new Error('plan failed')
      }
      return actual.makePlan(...args)
    },
  }
})

// The assistant "thinks" for 650 ms before it answers: the tests do not wait for it in real time.
const THINK_MS = 650
beforeEach(() => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === THINK_MS ? 0 : ms, ...args)) as typeof setTimeout)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  failPlan.once = false
})

const view = () => <AssistantSearch newHotels={newHotels} onChoose={() => ({})} />

function renderAssistant() {
  vi.stubGlobal('fetch', fetchMock)
  const result = render(view())
  return { ...result, user: userEvent.setup() }
}

const log = () => screen.getByRole('list', { name: 'Диалог с Эвалом' })
const inLog = (text: string | RegExp) => within(log()).findByText(text, {})
const chatList = () => screen.getByRole('navigation', { name: 'Чаты' })
const input = () => screen.getByLabelText('Опишите поездку')
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string)
/** «Новый чат» over the chat: the list of chats has its own one too. */
const newChatButton = () => screen.getAllByRole('button', { name: 'Новый чат' })[0]
const answer = (body: object) => Response.json({ source: 'model', ...body })

/** A reply the test sends when it wants to. */
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

// assistant-search, Requirement: Разбор пожелания
describe('AssistantSearch with the model', () => {
  it('shows what the model understood from a free phrase (Scenario: Свободная фраза)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea', budget: 40000 }, reply: 'Тёплое море!' }))
    const { user } = renderAssistant()

    await user.type(input(), 'хочу туда, где тепло и можно поплавать с маской{Enter}')

    expect(await inLog('Записал: море · до 40 000 ₽. Когда планируете поехать?')).toBeTruthy()
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/assistant')
    expect(bodyOf(0)).toEqual({
      messages: [{ role: 'user', text: 'хочу туда, где тепло и можно поплавать с маской' }],
      brief: {},
    })
  })

  it('sends the dialog so far and the brief with the next message', async () => {
    fetchMock
      .mockResolvedValueOnce(answer({ brief: { vibe: 'sea' } }))
      .mockResolvedValueOnce(answer({ brief: { vibe: 'sea', when: 9 } }))
    const { user } = renderAssistant()

    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)
    await user.type(input(), 'осенью, в октябре{Enter}')
    await inLog(/С кем едете/)

    expect(bodyOf(1)).toEqual({
      messages: [
        { role: 'user', text: 'к морю' },
        { role: 'assistant', text: 'Записал: море. Когда планируете поехать?' },
        { role: 'user', text: 'осенью, в октябре' },
      ],
      brief: { vibe: 'sea' },
    })
  })

  it('leads with the model remark when nothing is understood yet', async () => {
    fetchMock.mockResolvedValue(answer({ brief: {}, reply: 'Привет!' }))
    const { user } = renderAssistant()

    await user.type(input(), 'привет{Enter}')

    expect(await inLog(/^Привет! Какое настроение у поездки\?/)).toBeTruthy()
  })

  it('reads the wish with the rules when the route fails, without an error (Scenario: Модель недоступна)', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 429 }))
    const { user } = renderAssistant()

    await user.type(input(), 'Хочу на море в октябре, бюджет до 70 000 ₽{Enter}')

    expect(
      await inLog('Записал: море · в октябре · до 70 000 ₽. С кем едете? Так я подберу номер и формат отдыха.'),
    ).toBeTruthy()
    expect(log().textContent).not.toMatch(/ошибк/i)
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
  })

  it('falls back to the rules when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = renderAssistant()

    await user.type(input(), 'в горы{Enter}')

    expect(await inLog('Записал: горы. Когда планируете поехать?')).toBeTruthy()
  })

  it('caps the message at 500 characters', () => {
    renderAssistant()
    expect(input().getAttribute('maxlength')).toBe('500')
  })
})

// assistant-search, Requirement: Чат для долгих диалогов
describe('AssistantSearch composer and feed', () => {
  it('breaks the line on Shift+Enter and sends on Enter', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea' } }))
    const { user } = renderAssistant()

    await user.type(input(), 'к морю{Shift>}{Enter}{/Shift}в октябре')
    expect((input() as HTMLTextAreaElement).value).toBe('к морю\nв октябре')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(input(), '{Enter}')
    expect(await within(log()).findByText('к морю\nв октябре', { normalizer: (text) => text })).toBeTruthy()
    expect((input() as HTMLTextAreaElement).value).toBe('')
  })

  it('shows that Eval is answering and keeps the send button off meanwhile', async () => {
    const reply = deferred()
    fetchMock.mockReturnValue(reply.promise)
    const { user } = renderAssistant()

    await user.type(input(), 'к морю{Enter}')
    expect(within(log()).getByLabelText('Эвал думает')).toBeTruthy()
    await user.type(input(), 'ещё')
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)

    reply.resolve(answer({ brief: { vibe: 'sea' } }))
    expect(await inLog(/Когда планируете поехать/)).toBeTruthy()
    expect(within(log()).queryByLabelText('Эвал думает')).toBeNull()
  })

  it('asks a failed answer again on «Повторить»', async () => {
    fetchMock.mockImplementation(async () => answer({ brief: { destinationId: 'lisbon', when: 9, party: 'solo' } }))
    failPlan.once = true
    const { user } = renderAssistant()

    await user.type(input(), 'Лиссабон в октябре, один{Enter}')
    expect(await inLog('Не получилось ответить.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await within(log()).findByText('Атмосфера поездки', {})).toBeTruthy()
    expect(within(log()).queryByText('Не получилось ответить.')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not jump while the traveller reads older messages (Scenario: Чтение старых сообщений)', async () => {
    const reply = deferred()
    fetchMock.mockResolvedValueOnce(answer({ brief: { vibe: 'sea' } })).mockReturnValueOnce(reply.promise)
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)
    await user.type(input(), 'в октябре{Enter}')

    // The traveller scrolls up a long feed while Eval answers.
    const feed = log()
    const scrollTo = vi.fn()
    feed.scrollTo = scrollTo
    Object.defineProperty(feed, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(feed, 'clientHeight', { configurable: true, value: 400 })
    feed.scrollTop = 200
    fireEvent.scroll(feed)
    reply.resolve(answer({ brief: { vibe: 'sea', when: 9 } }))

    const toNew = await screen.findByRole('button', { name: 'К новому сообщению' })
    expect(scrollTo).not.toHaveBeenCalled()
    await user.click(toNew)
    expect(scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' })
    expect(screen.queryByRole('button', { name: 'К новому сообщению' })).toBeNull()
  })

  it('follows the new answer while the traveller is at the end', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea' } }))
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)
    expect(screen.queryByRole('button', { name: 'К новому сообщению' })).toBeNull()
  })
})

// assistant-search, Requirement: Шаги агентов в чате
describe('AssistantSearch steps of the agents', () => {
  it('shows the step with its status, then the answer with the hotels (Scenario: Шаг агента)', async () => {
    const reply = deferred()
    fetchMock.mockReturnValue(reply.promise)
    const { user } = renderAssistant()

    await user.type(input(), 'Лиссабон в октябре, один{Enter}')
    // The rules already see a complete brief: the search step shows while Eval works.
    expect(
      within(log())
        .getByText(/Подбираю отели по вашему описанию/)
        .closest('li')?.dataset.step,
    ).toBe('pending')

    reply.resolve(
      answer({
        brief: { destinationId: 'lisbon', when: 9, party: 'solo' },
        steps: [
          { agent: 'search', title: 'Подбираю отели по вашему описанию', status: 'done', result: 'нашёл 3 отеля' },
        ],
      }),
    )

    const step = await inLog('Подбираю отели по вашему описанию — нашёл 3 отеля')
    expect(step.closest('li')?.dataset.step).toBe('done')
    const items = within(log()).getAllByRole('listitem')
    const stepAt = items.findIndex((li) => li.contains(step))
    const planAt = items.findIndex((li) => within(li).queryByText('Атмосфера поездки'))
    expect(stepAt).toBeGreaterThan(-1)
    expect(planAt).toBe(stepAt + 1)
  })

  it('names the criteria without data instead of guessing (Scenario: Нет данных)', async () => {
    fetchMock.mockResolvedValue(
      answer({ brief: { destinationId: 'prague', when: 9, party: 'solo', quiet: true }, missing: ['quiet'] }),
    )
    const { user } = renderAssistant()

    await user.type(input(), 'тихий отель в Праге в октябре, один{Enter}')

    expect(await inLog(/Данных о шуме у отелей Праги нет/)).toBeTruthy()
    expect(within(log()).getAllByText('нет данных о шуме').length).toBeGreaterThan(0)
  })

  it('explains each hotel by its features', async () => {
    const lisbon = newHotels.find((h) => h.destinationId === 'lisbon')!
    fetchMock.mockResolvedValue(
      answer({
        brief: { destinationId: 'lisbon', when: 9, party: 'solo', quiet: true, height: 'high' },
        matches: [lisbon],
        features: { [lisbon.id]: { floors: 12, heightM: 38, lnight: { min: 45, max: 49 }, views: [] } },
      }),
    )
    const { user } = renderAssistant()

    await user.type(input(), 'тихо и повыше, Лиссабон в октябре, один{Enter}')

    const option = await within(log()).findByRole('button', { name: new RegExp(lisbon.name) }, {})
    expect(option.textContent).toContain('ночью 45–49 дБ')
    expect(option.textContent).toContain('здание 12 этажей, 38 м')
  })
})

// assistant-search, Requirement: План поездки — hotels only, no ready-made route.
describe('AssistantSearch plan', () => {
  it('shows the hotels of the plan and no route', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { destinationId: 'lisbon', when: 9, party: 'solo' } }))
    const { user } = renderAssistant()
    await user.type(input(), 'Лиссабон в октябре, один{Enter}')
    expect(await within(log()).findByText('Атмосфера поездки', {})).toBeTruthy()
    expect(within(log()).getAllByRole('button', { name: /Лиссабон/ }).length).toBeGreaterThan(0)
    expect(log().textContent).not.toMatch(/маршрут/i)
    expect(within(log()).queryByRole('link')).toBeNull()
  })
})

// assistant-search, Requirement: История чатов
describe('AssistantSearch chats', () => {
  it('opens an empty chat and keeps the previous one in the list (Scenario: Новый чат)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea' } }))
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)

    await user.click(newChatButton())

    expect(screen.queryByRole('list', { name: 'Диалог с Эвалом' })).toBeNull()
    expect(screen.getByRole('heading', { name: /О каком путешествии вы мечтаете/ })).toBeTruthy()
    const previous = within(chatList()).getByRole('button', { name: /к морю/ })
    await user.click(previous)
    expect(await inLog('Записал: море. Когда планируете поехать?')).toBeTruthy()
  })

  it('brings the answer to its own chat while another is open (Scenarios: Ответ в другом чате, Сброс)', async () => {
    const reply = deferred()
    fetchMock.mockReturnValueOnce(reply.promise)
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await user.click(newChatButton())

    const waiting = within(chatList()).getByRole('button', { name: /к морю/ })
    expect(waiting.textContent).toContain('ждёт ответа')

    await act(async () => reply.resolve(answer({ brief: { vibe: 'sea' } })))

    await waitFor(() => expect(waiting.textContent).toContain('новое'))
    expect(waiting.textContent).not.toContain('ждёт ответа')
    // The open chat stays empty.
    expect(screen.queryByRole('list', { name: 'Диалог с Эвалом' })).toBeNull()

    await user.click(waiting)
    expect(await inLog('Записал: море. Когда планируете поехать?')).toBeTruthy()
    expect(within(chatList()).getByRole('button', { name: /к морю/ }).textContent).not.toContain('новое')
  })
})

// assistant-search, Requirement: Чаты после перезагрузки
describe('AssistantSearch after a reload', () => {
  it('restores the dialog, the brief and the question (Scenario: Перезагрузка после «Записал»)', async () => {
    fetchMock
      .mockResolvedValueOnce(answer({ brief: { vibe: 'sea' } }))
      .mockResolvedValueOnce(answer({ brief: { vibe: 'sea', when: 9 } }))
    const { user, unmount } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog('Записал: море. Когда планируете поехать?')

    unmount()
    render(view())

    expect(await inLog('Записал: море. Когда планируете поехать?')).toBeTruthy()
    expect(screen.queryByLabelText('Эвал думает')).toBeNull()
    await user.type(input(), 'в октябре{Enter}')
    await inLog(/С кем едете/)
    expect(bodyOf(1).brief).toEqual({ vibe: 'sea' })
  })

  it('finishes a pending answer after a reload', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(answer({ brief: { vibe: 'sea' } }))
    const { user, unmount } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    expect(within(log()).getByLabelText('Эвал думает')).toBeTruthy()

    unmount()
    render(view())

    expect(await inLog('Записал: море. Когда планируете поехать?')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(1)).toEqual(bodyOf(0))
  })

  it('keeps every chat after a reload (Scenario: Вторая сессия)', async () => {
    // A body is read once: every request gets its own response.
    fetchMock.mockImplementation(async () => answer({ brief: { vibe: 'sea' } }))
    const { user, unmount } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)
    await user.click(newChatButton())
    await user.type(input(), 'тихий отель{Enter}')
    await inLog(/Когда планируете поехать/)

    unmount()
    render(view())

    const chats = within(chatList()).getAllByRole('button', { name: /к морю|тихий отель/ })
    expect(chats.map((c) => c.textContent)).toEqual([
      expect.stringContaining('тихий отель'),
      expect.stringContaining('к морю'),
    ])
    expect(JSON.parse(window.localStorage.getItem(CHATS_KEY)!)).toHaveLength(2)
  })

  it('moves the dialog of an older version with a route into a chat (Scenario: Старый диалог с маршрутом)', async () => {
    const brief = { destinationId: 'lisbon', when: 9, party: 'solo' as const }
    const plan = makePlan(brief, todayIso(), destinations, newHotels)
    // The dialog as the version with routes saved it: the plan's message carried its ready-made route.
    const route = {
      id: 'lisbon-workation',
      title: 'Воркейшн в Лиссабоне',
      persona: 'workation',
      destinationId: 'lisbon',
    }
    window.sessionStorage.setItem(
      DIALOG_KEY,
      JSON.stringify({
        messages: [
          { from: 'user', text: 'Лиссабон в октябре, один' },
          { from: 'agent', text: 'Записал: Лиссабон.', plan, route },
        ],
        brief,
        question: null,
      }),
    )

    renderAssistant()

    expect(await within(log()).findByText('Атмосфера поездки', {})).toBeTruthy()
    expect(within(log()).getAllByRole('button', { name: /Лиссабон/ }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Воркейшн в Лиссабоне')).toBeNull()
    expect(within(log()).queryByRole('link')).toBeNull()
    expect(window.sessionStorage.getItem(DIALOG_KEY)).toBeNull()
  })

  it.each([
    [DIALOG_KEY, 'not json', window.sessionStorage],
    [
      DIALOG_KEY,
      JSON.stringify({ messages: [{ from: 'bot', text: 1 }], brief: {}, question: null }),
      window.sessionStorage,
    ],
    [CHATS_KEY, 'not json', window.localStorage],
    [CHATS_KEY, JSON.stringify([{ id: 1, messages: 'x' }]), window.localStorage],
  ])('ignores damaged data %#: %s (Scenario: Битые данные)', (key, raw, storage) => {
    storage.setItem(key, raw)
    renderAssistant()
    expect(screen.queryByRole('list', { name: 'Диалог с Эвалом' })).toBeNull()
    expect(screen.getByText('О каком путешествии вы мечтаете?')).toBeTruthy()
  })
})

// assistant-search, Requirement: Начальный экран
describe('AssistantSearch start screen', () => {
  it('shows the Эвал avatar on the start screen', () => {
    renderAssistant()
    expect(screen.getByAltText('Эвал')).toBeTruthy()
  })

  it('opens with the reply bubble, the example and three photo cards', () => {
    renderAssistant()
    expect(screen.getByRole('heading', { name: 'О каком путешествии вы мечтаете?' })).toBeTruthy()
    expect(screen.getByText('Я подберу идеальное жильё, направление и лучшие варианты для вашего отдыха')).toBeTruthy()
    expect(screen.getByPlaceholderText('Например: «Хочу на море в октябре, спокойный отдых, с ребёнком»')).toBeTruthy()
    const ideas = screen.getByRole('list', { name: 'Идеи для поездки' })
    expect(
      within(ideas)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['🌴На море', '⛰️В горы', '🏛️Города'])
  })

  it('sends the card’s label as the traveller’s message (Scenario: Чип отправляет текст)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'mountains' } }))
    const { user } = renderAssistant()

    await user.click(screen.getByRole('button', { name: 'В горы' }))

    expect(within(log()).getByText('В горы')).toBeTruthy()
    expect(bodyOf(0).messages).toEqual([{ role: 'user', text: 'В горы' }])
    expect(screen.queryByRole('list', { name: 'Идеи для поездки' })).toBeNull()
  })
})
