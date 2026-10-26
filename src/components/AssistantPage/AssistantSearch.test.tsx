import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '../../data/destinations'
import { makePlan } from '../../lib/assistant'
import { CHATS_KEY, type Chat } from '../../lib/assistantChats'
import { newHotels } from '../../lib/catalogGenerator'
import { DIALOG_KEY } from '../../lib/assistantDialog'
import { todayIso } from '../../lib/dates'
import { catalogFetch } from '../../test/catalog'
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

// Heavy by nature: a multi-step dialog rendered in jsdom takes ~0.5 s alone and several times that on a busy machine,
// so the default 5 s is not enough there.
const HEAVY = 20_000

// The assistant "thinks" for 650 ms before it answers: the tests do not wait for it in real time.
const THINK_MS = 650
beforeEach(() => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === THINK_MS ? 0 : ms, ...args)) as typeof setTimeout)
})

afterEach(() => {
  // Unmounted first: the hooks of this file run before the cleanup of src/test/setup.ts, and an unmount runs the
  // effects still pending, so a chat saved by them would outlive the cleared storage and open in the next test.
  cleanup()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  failPlan.once = false
  // The open chat lives in the address.
  window.history.replaceState(null, '', '/assistant')
})

const view = () => <AssistantSearch newHotels={newHotels} onChoose={() => ({})} />

/** The route of Eval is the test's; the hotels of the cards come from the catalogue. */
const routedFetch: typeof fetch = (input, init) =>
  String(input).startsWith('/api/hotels') ? catalogFetch(input) : fetchMock(input, init)

function renderAssistant() {
  vi.stubGlobal('fetch', routedFetch)
  const result = render(view())
  return { ...result, user: userEvent.setup() }
}

const log = () => screen.getByRole('log', { name: 'Диалог с Эвалом' })
/** The scrolling feed around the log, and its button to the newest message (inert while there is none below). */
const feedViewport = () => screen.getByRole('region', { name: 'Лента чата' })
const toNew = () => screen.getByRole('button', { name: 'К новому сообщению' })
const inLog = (text: string | RegExp) => within(log()).findByText(text, {})
const chatList = () => screen.getByRole('navigation', { name: 'Чаты' })
const input = () => screen.getByLabelText('Опишите поездку')
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string)
/** «Новый чат» over the chat: the list of chats has its own one too. */
const newChatButton = () => screen.getAllByRole('button', { name: 'Новый чат' })[0]
/** The links of the feed lead to hotel pages and to the map of the answer's hotels only: no ready-made route. */
const hotelLinksOnly = () =>
  within(log())
    .queryAllByRole('link')
    .every((link) => /^\/(hotels\/[^/?]+|search)\?/.test(link.getAttribute('href') ?? ''))
/** The links of the Lisbon hotel cards, once the hotels have loaded. */
const lisbonHotelLinks = async () =>
  (await within(log()).findAllByRole('article')).flatMap((card) =>
    within(card)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/hotels/lisbon-')),
  )
/** Where the messages went: every stored chat with its messages, for a failure to tell the chat a message landed in. */
const storedChats = () =>
  JSON.stringify(
    (JSON.parse(window.localStorage.getItem(CHATS_KEY) ?? '[]') as Chat[]).map((c) => ({
      id: c.id,
      title: c.title,
      messages: c.messages.map((m) => `${m.role}: ${m.text}`),
    })),
    null,
    1,
  )
/** The newest chat is open and empty: Эвал's greeting, no log. */
const emptyChatOpen = async () => {
  expect(await screen.findByText(/О каком путешествии вы мечтаете/)).toBeTruthy()
  expect(screen.queryByRole('log', { name: 'Диалог с Эвалом' })).toBeNull()
}

const answer = (body: object) => Response.json({ source: 'model', ...body })

/** A reply the test sends when it wants to. */
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

// assistant-search, Requirement: Разбор пожелания
describe('AssistantSearch with the model', () => {
  it(
    'shows what the model understood from a free phrase (Scenario: Свободная фраза)',
    async () => {
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
    },
    HEAVY,
  )

  it(
    'sends the dialog so far and the brief with the next message',
    async () => {
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
    },
    HEAVY,
  )

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

    // The traveller scrolls up a long feed while Eval answers: jsdom has no layout, so the feed tells its sizes.
    const feed = feedViewport()
    const scrollTo = vi.fn()
    feed.scrollTo = scrollTo
    Object.defineProperty(feed, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(feed, 'clientHeight', { configurable: true, value: 400 })
    const rect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // The messages end 1800 px below the top of the feed, scrolled 200 px down.
      return this.dataset.messageId ? DOMRect.fromRect({ y: 1700, height: 100 }) : rect.call(this)
    })
    feed.scrollTop = 200
    fireEvent.wheel(feed)
    fireEvent.scroll(feed)
    reply.resolve(answer({ brief: { vibe: 'sea', when: 9 } }))
    await inLog(/Записал/)

    await waitFor(() => expect(toNew().dataset.active).toBe('true'))
    expect(scrollTo).not.toHaveBeenCalled()
    await user.click(toNew())
    expect(scrollTo).toHaveBeenCalledWith({ top: 1600, behavior: 'smooth' })
    await waitFor(() => expect(toNew().dataset.active).toBe('false'))
  })

  it('follows the new answer while the traveller is at the end', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea' } }))
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)
    expect(toNew().dataset.active).toBe('false')
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
        .closest<HTMLElement>('[data-message-id]')?.dataset.step,
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
    expect(step.closest<HTMLElement>('[data-message-id]')?.dataset.step).toBe('done')
    const items = [...log().querySelectorAll<HTMLElement>('[data-message-id]')]
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

    const why = await within(log()).findByRole('list', { name: 'Почему эти отели' })
    const line = within(why).getByText(lisbon.name).closest('li')!
    expect(line.textContent).toContain('ночью 45–49 дБ')
    expect(line.textContent).toContain('здание 12 этажей, 38 м')
    const card = (await within(log()).findByRole('link', { name: lisbon.name })).closest('article')!
    expect(card.textContent).not.toContain('дБ')
  })
})

// assistant-search, Requirement: План поездки — hotels only, no ready-made route.
describe('AssistantSearch plan', () => {
  it('shows the hotels of the plan and no route', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { destinationId: 'lisbon', when: 9, party: 'solo' } }))
    const { user } = renderAssistant()
    await user.type(input(), 'Лиссабон в октябре, один{Enter}')
    expect(await within(log()).findByText('Атмосфера поездки', {})).toBeTruthy()
    expect(await lisbonHotelLinks()).not.toHaveLength(0)
    expect(log().textContent).not.toMatch(/маршрут/i)
    expect(hotelLinksOnly()).toBe(true)
  })

  it('asks again for the hotels of the plan after a failed load, instead of keeping the bare cards', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { destinationId: 'lisbon', when: 9, party: 'solo' } }))
    let failed = false
    vi.stubGlobal('fetch', ((input, init) => {
      if (!String(input).startsWith('/api/hotels')) return fetchMock(input, init)
      if (failed) return catalogFetch(input)
      failed = true
      return Promise.resolve(new Response('{}', { status: 500 }))
    }) as typeof fetch)
    const { user } = { user: userEvent.setup(), ...render(view()) }
    await user.type(input(), 'Лиссабон в октябре, один{Enter}')
    expect(await within(log()).findByText('Атмосфера поездки', {})).toBeTruthy()
    await waitFor(async () => expect(await lisbonHotelLinks()).not.toHaveLength(0), { timeout: 8000 })
    expect(failed).toBe(true)
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

    expect(screen.queryByRole('log', { name: 'Диалог с Эвалом' })).toBeNull()
    expect(screen.getByText(/О каком путешествии вы мечтаете/)).toBeTruthy()
    const previous = within(chatList()).getByRole('button', { name: /^(?!Действия).*(?:к морю)/ })
    await user.click(previous)
    expect(await inLog('Записал: море. Когда планируете поехать?')).toBeTruthy()
  })

  it('has one «Новый чат» in the list, floating on phones and in the column from lg', () => {
    renderAssistant()
    const button = within(chatList()).getByRole('button', { name: 'Новый чат' })
    expect(button.className).toContain('max-lg:fixed')
    expect(screen.getAllByRole('button', { name: 'Новый чат' })).toHaveLength(1)
  })

  it('brings the answer to its own chat while another is open (Scenarios: Ответ в другом чате, Сброс)', async () => {
    const reply = deferred()
    fetchMock.mockReturnValueOnce(reply.promise)
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await user.click(newChatButton())

    const waiting = within(chatList()).getByRole('button', { name: /^(?!Действия).*(?:к морю)/ })
    expect(waiting.textContent).toContain('ждёт ответа')

    await act(async () => reply.resolve(answer({ brief: { vibe: 'sea' } })))

    await waitFor(() => expect(waiting.textContent).toContain('новое'))
    expect(waiting.textContent).not.toContain('ждёт ответа')
    // The open chat stays empty.
    expect(screen.queryByRole('log', { name: 'Диалог с Эвалом' })).toBeNull()

    await user.click(waiting)
    expect(await inLog('Записал: море. Когда планируете поехать?')).toBeTruthy()
    expect(within(chatList()).getByRole('button', { name: /^(?!Действия).*(?:к морю)/ }).textContent).not.toContain(
      'новое',
    )
  })
})

// assistant-search, Requirement: Чаты после перезагрузки
describe('AssistantSearch after a reload', () => {
  it(
    'restores the dialog, the brief and the question (Scenario: Перезагрузка после «Записал»)',
    async () => {
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
    },
    HEAVY,
  )

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

  it(
    'keeps every chat after a reload (Scenario: Вторая сессия)',
    async () => {
      // A body is read once: every request gets its own response.
      fetchMock.mockImplementation(async () => answer({ brief: { vibe: 'sea' } }))
      const { user, unmount } = renderAssistant()
      await user.type(input(), 'к морю{Enter}')
      // A duplicate here has flaked in CI: a failure tells which messages the chats hold.
      await inLog(/Когда планируете поехать/).catch((error: unknown) => {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\nstored: ${storedChats()}`)
      })
      await user.click(newChatButton())
      await emptyChatOpen()
      await user.type(input(), 'тихий отель{Enter}')
      await inLog(/Когда планируете поехать/)
      // One question in the open chat: a second one means the message went to the old chat.
      expect(within(log()).getAllByText(/Когда планируете поехать/), storedChats()).toHaveLength(1)

      unmount()
      render(view())

      const chats = within(chatList()).getAllByRole('button', { name: /^(?!Действия).*(?:к морю|тихий отель)/ })
      expect(chats.map((c) => c.textContent)).toEqual([
        expect.stringContaining('тихий отель'),
        expect.stringContaining('к морю'),
      ])
      expect(JSON.parse(window.localStorage.getItem(CHATS_KEY)!)).toHaveLength(2)
    },
    HEAVY,
  )

  it('opens an empty chat right after the answer and sends there (Scenario: Новый чат сразу после ответа)', async () => {
    fetchMock.mockImplementation(async () => answer({ brief: { vibe: 'sea' } }))
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    await inLog(/Когда планируете поехать/)

    // At once: no pause between the answer and the click, nor between the click and the typing.
    fireEvent.click(newChatButton())
    await user.type(input(), 'тихий отель{Enter}')
    await inLog(/Когда планируете поехать/)

    expect(within(log()).getAllByText(/Когда планируете поехать/), storedChats()).toHaveLength(1)
    expect(within(log()).queryByText('к морю')).toBeNull()
    const stored = JSON.parse(window.localStorage.getItem(CHATS_KEY)!) as Chat[]
    expect(
      stored.map((c) => c.messages.map((m) => m.text)),
      storedChats(),
    ).toEqual([
      ['тихий отель', expect.stringContaining('Когда планируете поехать')],
      ['к морю', expect.stringContaining('Когда планируете поехать')],
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(1).messages).toEqual([{ role: 'user', text: 'тихий отель' }])
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
    expect(await lisbonHotelLinks()).not.toHaveLength(0)
    expect(screen.queryByText('Воркейшн в Лиссабоне')).toBeNull()
    expect(hotelLinksOnly()).toBe(true)
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
    expect(screen.queryByRole('log', { name: 'Диалог с Эвалом' })).toBeNull()
    expect(screen.getByText(/О каком путешествии вы мечтаете/)).toBeTruthy()
  })
})

// assistant-search, Requirement: Одна копия сообщения — the two tests go in this order.
describe('AssistantSearch from one test to the next', () => {
  it('ends right as the answer shows, before its chat is saved', async () => {
    const reply = deferred()
    fetchMock.mockReturnValueOnce(reply.promise)
    const { user } = renderAssistant()
    await user.type(input(), 'к морю{Enter}')
    // The answer's render is in the page, the effect saving its chat has not run yet: no wait that lets a task pass.
    const shown = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.body.textContent?.includes('Когда планируете поехать')) return
        observer.disconnect()
        resolve()
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    reply.resolve(answer({ brief: { vibe: 'sea' } }))
    await shown
  })

  it(
    'starts without the chats of the test before (Scenario: Один ввод)',
    async () => {
      expect(window.localStorage.getItem(CHATS_KEY), storedChats()).toBeNull()
      fetchMock.mockImplementation(async () => answer({ brief: { vibe: 'sea' } }))
      const { user } = renderAssistant()
      await user.type(input(), 'к морю{Enter}')
      await inLog(/Когда планируете поехать/)
      expect(within(log()).getAllByText('к морю')).toHaveLength(1)
    },
    HEAVY,
  )
})

// assistant-search, Requirement: Начальный экран
describe('AssistantSearch start screen', () => {
  it('shows the Эвал avatar on the start screen', () => {
    renderAssistant()
    expect(screen.getByAltText('Эвал')).toBeTruthy()
  })

  it('opens with the greeting cloud, the example and five chips', () => {
    renderAssistant()
    expect(
      screen.getByText(
        /О каком путешествии вы мечтаете\?.*Я подберу идеальное жильё, направление и лучшие варианты для вашего отдыха/,
      ),
    ).toBeTruthy()
    expect(screen.getByPlaceholderText('Напишите, что ищете…')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Новый чат' })).toBeTruthy()
    expect(screen.getByText('Ассистент Эвал')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Поделиться' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Действия с чатом' })).toBeNull()
    const ideas = screen.getByRole('list', { name: 'Идеи для поездки' })
    expect(
      within(ideas)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['🏖️На море', '⛰️В горы', '🏙️В город', '👨‍👩‍👧С детьми', '✈️Куда угодно'])
  })

  it('shows the chat’s title, «Поделиться» and the menu after the first message (Scenario: Первое сообщение)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'mountains' } }))
    const { user } = renderAssistant()

    await user.click(screen.getByRole('button', { name: 'В горы' }))

    expect(await screen.findByRole('button', { name: 'Поделиться' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Действия с чатом' })).toBeTruthy()
    expect(screen.queryByText('Ассистент Эвал')).toBeNull()
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
