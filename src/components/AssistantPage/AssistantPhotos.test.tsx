import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHATS_KEY, newChat, type Chat } from '../../lib/assistantChats'
import { SIGNED_URL_REFRESH_MS } from '../../lib/assistantChatsRemote'
import { newHotels } from '../../lib/catalogGenerator'
import { catalogFetch } from '../../test/catalog'
import { setScreen, WIDE } from '../../test/screen'
import { AssistantSearch } from './AssistantSearch'
import { SharedChat } from './SharedChat'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// A guest by default; a test of the account sets its own Supabase client.
const supabase = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => supabase.client }))

// jsdom has no canvas: the optimised photo is the file's name in a data URL.
vi.mock('../../lib/imageOptimize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/imageOptimize')>()
  return {
    ...actual,
    optimizePhoto: async (file: File) => ({
      photo: `data:image/webp;base64,${btoa(file.name)}`,
      preview: `data:image/webp;base64,${btoa(`small-${file.name}`)}`,
      width: 1600,
      height: 1200,
    }),
  }
})

const fetchMock = vi.fn<typeof fetch>()
const THINK_MS = 650
// Heavy by nature: a multi-step dialog rendered in jsdom takes ~0.5 s alone and several times that on a busy machine,
// so the default 5 s is not enough there.
const HEAVY = 20_000
beforeEach(() => {
  setScreen(WIDE)
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === THINK_MS ? 0 : ms, ...args)) as typeof setTimeout)
})

afterEach(() => {
  supabase.client = null
  vi.restoreAllMocks()
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/assistant')
})

const routedFetch: typeof fetch = (input, init) =>
  String(input).startsWith('/api/hotels') ? catalogFetch(input) : fetchMock(input, init)

function renderAssistant() {
  vi.stubGlobal('fetch', routedFetch)
  const result = render(<AssistantSearch newHotels={newHotels} onChoose={() => ({})} />)
  return { ...result, user: userEvent.setup() }
}

const log = () => screen.getByRole('log', { name: 'Диалог с Эвалом' })
const input = () => screen.getByLabelText('Опишите поездку')
const picker = () => screen.getByLabelText<HTMLInputElement>('Выбрать фото')
const attached = () => screen.queryByRole('list', { name: 'Приложенные фото' })
const send = () => screen.getByRole('button', { name: 'Отправить' })
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string)
const photo = (name: string, type = 'image/jpeg') => new File(['x'], name, { type })
const answer = (body: object) => Response.json({ source: 'model', ...body })

// assistant-search, Requirement: Фото во вложениях
describe('the photos of a message', () => {
  it(
    'sends two photos with the message and clears the field (Scenario: Отправка фото)',
    async () => {
      fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'ask' } }))
      const { user } = renderAssistant()

      await user.upload(picker(), [photo('a.jpg'), photo('b.png', 'image/png')])
      expect(within(attached()!).getAllByRole('img')).toHaveLength(2)
      expect(screen.getByText(/2 из 4 фото/)).toBeTruthy()
      await user.click(send())

      const photos = await within(log()).findByRole('list', { name: 'Фото' })
      expect(within(photos).getAllByRole('button', { name: /Открыть фото/ })).toHaveLength(2)
      expect(attached()).toBeNull()
      expect((input() as HTMLTextAreaElement).value).toBe('')
      // The route gets the photos of 1600 px and «Фото» for the message without words.
      expect(bodyOf(0)).toEqual({
        messages: [{ role: 'user', text: 'Фото' }],
        brief: {},
        photos: [`data:image/webp;base64,${btoa('a.jpg')}`, `data:image/webp;base64,${btoa('b.png')}`],
      })
    },
    HEAVY,
  )

  it(
    'sends the words and the photos together',
    async () => {
      fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'unseen' } }))
      const { user } = renderAssistant()
      await user.upload(picker(), photo('a.jpg'))
      await user.type(input(), 'найди похожий{Enter}')
      expect(await within(log()).findByText('Провайдер распознавания фото не отвечает. Повторите позже.')).toBeTruthy()
      expect(bodyOf(0).messages).toEqual([{ role: 'user', text: 'найди похожий' }])
      expect(bodyOf(0).photos).toHaveLength(1)
    },
    HEAVY,
  )

  it('shows the switch to another model in one request (Scenario: Провайдер ответил со второго раза)', async () => {
    fetchMock.mockResolvedValue(
      answer({
        brief: {},
        photo: { action: 'unusable', seen: 'Только цветные полосы' },
        steps: [
          { agent: 'vision', title: 'Модель фото не ответила, смотрю другой', status: 'done', result: 'посмотрел' },
        ],
      }),
    )
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'найди похожий{Enter}')
    expect(await within(log()).findByText(/^Вижу на фото: Только цветные полосы\./)).toBeTruthy()
    expect(within(log()).getByText('Модель фото не ответила, смотрю другой')).toBeTruthy()
    expect(within(log()).getByText('посмотрел')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers the words without the photos and says so (Scenario: Провайдер не ответил)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { destinationId: 'valencia' }, photo: { action: 'skipped' } }))
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'хочу в Валенсию{Enter}')
    expect(
      await within(log()).findByText(
        /^Модель распознавания фото сейчас недоступна — ответил без фото\. Когда планируете поехать\?/,
      ),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it(
    'says the limit is over without retries (Scenario: Лимит запросов к модели фото)',
    async () => {
      fetchMock
        .mockResolvedValueOnce(answer({ brief: {}, photo: { action: 'limited' } }))
        .mockResolvedValueOnce(Response.json({ error: 'Too many requests' }, { status: 429 }))
      const { user } = renderAssistant()
      await user.upload(picker(), photo('a.jpg'))
      await user.type(input(), 'найди похожий{Enter}')
      const limit = 'Превышен лимит запросов к модели распознавания фото. Повторите позже.'
      expect(await within(log()).findByText(limit)).toBeTruthy()
      // The route's own limit reads the same.
      await user.upload(picker(), photo('b.jpg'))
      await user.type(input(), 'найди похожий{Enter}')
      await waitFor(() => expect(within(log()).getAllByText(limit)).toHaveLength(2))
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
    HEAVY,
  )

  it('takes no fifth photo and says why (Scenario: Пятое фото)', async () => {
    const { user } = renderAssistant()
    await user.upload(picker(), [photo('1.jpg'), photo('2.jpg'), photo('3.jpg'), photo('4.jpg')])
    await user.upload(picker(), photo('5.jpg'))
    expect(within(attached()!).getAllByRole('img')).toHaveLength(4)
    expect(screen.getByRole('alert').textContent).toBe('Можно приложить не больше 4 фото к сообщению.')
    // One goes: there is room again.
    await user.click(screen.getByRole('button', { name: 'Убрать фото 2' }))
    expect(within(attached()!).getAllByRole('img')).toHaveLength(3)
    await user.upload(picker(), photo('5.jpg'))
    expect(within(attached()!).getAllByRole('img')).toHaveLength(4)
  })

  it('declines another type or a file over 10 MB with a plain line', async () => {
    renderAssistant()
    fireEvent.change(picker(), { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } })
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Можно приложить только фото в JPEG, PNG или WebP.',
    )
    const big = photo('big.jpg')
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    fireEvent.change(picker(), { target: { files: [big] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Фото больше 10 МБ — выберите поменьше.'))
    expect(attached()).toBeNull()
    expect(send()).toHaveProperty('disabled', true)
  })

  it('opens a photo of the feed large', async () => {
    fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'ask' } }))
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.click(send())
    await user.click(await within(log()).findByRole('button', { name: 'Открыть фото 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фото 1' })
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(`data:image/webp;base64,${btoa('small-a.jpg')}`)
  })

  it('opens the full photo large while the thumbnail stays the preview', async () => {
    const chat: Chat = {
      ...newChat('2026-10-25T10:00:00.000Z'),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          status: 'done',
          text: '',
          data: {
            attachments: [
              {
                preview: 'data:image/webp;base64,c21hbGw=',
                url: 'https://cdn.example/full.webp',
                width: 1600,
                height: 1200,
              },
            ],
          },
          createdAt: '2026-10-25T10:00:00.000Z',
        },
      ],
    }
    window.localStorage.setItem(CHATS_KEY, JSON.stringify([chat]))
    window.history.replaceState(null, '', `/assistant/${chat.id}`)
    const { user } = renderAssistant()
    const tile = await screen.findByRole('button', { name: 'Открыть фото 1' })
    expect(tile.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,c21hbGw=')
    await user.click(tile)
    const dialog = await screen.findByRole('dialog', { name: 'Фото 1' })
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe('https://cdn.example/full.webp')
  })

  it('reads «Фото» for a photo whose file is gone', async () => {
    const chat: Chat = {
      ...newChat('2026-10-25T10:00:00.000Z'),
      title: 'Фото',
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          status: 'done',
          text: 'как здесь',
          data: { attachments: [{ width: 1600, height: 1200 }] },
          createdAt: '2026-10-25T10:00:00.000Z',
        },
      ],
    }
    window.localStorage.setItem(CHATS_KEY, JSON.stringify([chat]))
    window.history.replaceState(null, '', `/assistant/${chat.id}`)
    renderAssistant()
    expect(await within(log()).findByLabelText('Фото недоступно')).toBeTruthy()
    expect(within(log()).getByText('как здесь')).toBeTruthy()
  })
})

// assistant-search, Requirement: Что сделать с фото
describe('what Эвал does with the photos', () => {
  it('asks with two chips and sends the same photos with the chosen one (Scenario: Фото без текста)', async () => {
    fetchMock
      .mockResolvedValueOnce(answer({ brief: {}, photo: { action: 'ask' } }))
      .mockResolvedValueOnce(answer({ brief: {}, photo: { action: 'unseen' } }))
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.click(send())

    expect(await within(log()).findByText(/Что сделать с фото\?/)).toBeTruthy()
    const replies = screen.getByRole('list', { name: 'Быстрые ответы' })
    expect(
      within(replies)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Найти похожие отели', 'Учесть в запросе'])
    await user.click(within(replies).getByRole('button', { name: 'Найти похожие отели' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(bodyOf(1).messages.at(-1)).toEqual({ role: 'user', text: 'Найти похожие отели' })
    expect(bodyOf(1).photos).toEqual([`data:image/webp;base64,${btoa('a.jpg')}`])
  })

  it('shows the hotels like the photo with what they are like in (Scenario: Понятный текст)', async () => {
    fetchMock.mockResolvedValue(
      answer({
        brief: {},
        photo: { action: 'similar', seen: 'Светлый номер с видом на море', like: 'вид на море' },
        matches: newHotels.slice(0, 2),
        steps: [{ agent: 'search', title: 'Ищу отели, похожие на фото', status: 'done', result: 'нашёл 2' }],
      }),
    )
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'найди похожий отель{Enter}')

    expect(
      await within(log()).findByText('Вижу на фото: Светлый номер с видом на море. Нашёл похожие отели.'),
    ).toBeTruthy()
    expect(within(log()).getAllByText('Похоже: вид на море').length).toBeGreaterThan(0)
    expect(within(log()).getByText('Ищу отели, похожие на фото')).toBeTruthy()
    expect(within(log()).getByText('нашёл 2')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Быстрые ответы' })).toBeNull()
  })

  it('shows no hotels for a photo with nothing a hotel is chosen by and asks for words', async () => {
    fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'unusable', seen: 'Только цветные полосы' } }))
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'найди похожий отель{Enter}')
    expect(
      await within(log()).findByText(
        'Вижу на фото: Только цветные полосы. По такому фото не подобрать отель — опишите словами, что для вас важно: вид, стиль, место.',
      ),
    ).toBeTruthy()
    expect(within(log()).queryByText(/Нашёл похожие отели/)).toBeNull()
    expect(within(log()).queryAllByRole('article')).toHaveLength(0)
  })

  it('says so when the search for similar hotels did not answer', async () => {
    fetchMock.mockResolvedValue(
      answer({
        brief: {},
        photo: { action: 'similar', seen: 'Номер у моря', missed: true },
        steps: [{ agent: 'search', title: 'Ищу отели, похожие на фото', status: 'failed', result: 'поиск не ответил' }],
      }),
    )
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'найди похожий{Enter}')
    expect(
      await within(log()).findByText(/^Вижу на фото: Номер у моря\. Поиск похожих отелей сейчас не ответил/),
    ).toBeTruthy()
    expect(within(log()).getByText('Ищу отели, похожие на фото')).toBeTruthy()
    expect(within(log()).getByText('поиск не ответил')).toBeTruthy()
    expect(within(log()).queryAllByRole('article')).toHaveLength(0)
  })

  it('tells what it saw before the brief when the photo went into the wish', async () => {
    fetchMock.mockResolvedValue(
      answer({ brief: { view: 'sea' }, photo: { action: 'refine', seen: 'Вид на море с балкона' } }),
    )
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'учти{Enter}')
    expect(
      await within(log()).findByText(/^Вижу на фото: Вид на море с балкона\. Какое настроение у поездки\?/),
    ).toBeTruthy()
    expect(within(log()).getByText('Вид из окна: на море')).toBeTruthy()
  })
})

// assistant-search, Requirement: Фото у гостя
describe('a guest’s photos', () => {
  it('warns that a chat with photos is kept only after signing in (Scenario: Гость прикладывает фото)', async () => {
    const { user } = renderAssistant()
    expect(screen.queryByText(/Чат с фото сохранится/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Приложить фото, до 4' }))
    expect(screen.getByText(/Чат с фото сохранится, только если вы войдёте/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login?next=/assistant')
  })

  it('keeps only the previews in the browser', async () => {
    fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'ask' } }))
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.click(send())
    await within(log()).findByText(/Что сделать с фото\?/)
    const [saved] = JSON.parse(window.localStorage.getItem(CHATS_KEY)!) as Chat[]
    expect(saved.messages[0].data.attachments).toEqual([
      { preview: `data:image/webp;base64,${btoa('small-a.jpg')}`, width: 1600, height: 1200 },
    ])
    expect(JSON.stringify(saved)).not.toContain(`base64,${btoa('a.jpg')}`)
  })
})

// assistant-search, Requirement: Хранение фото
describe('a shared chat with photos', () => {
  it('shows the photos of the snapshot to anyone with the link (Scenario: Снимок по ссылке)', async () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/assistant-shared-attachments/u/s/0.webp'
    render(
      <SharedChat
        share={{
          id: crypto.randomUUID(),
          title: 'Фото',
          brief: {},
          createdAt: '2026-10-25T10:00:00.000Z',
          messages: [
            {
              id: crypto.randomUUID(),
              role: 'user',
              status: 'done',
              text: '',
              data: { attachments: [{ url, width: 1600, height: 1200 }] },
              createdAt: '2026-10-25T10:00:00.000Z',
            },
          ],
        }}
      />,
    )
    const button = await within(log()).findByRole('button', { name: 'Открыть фото 1' })
    expect(button.querySelector('img')?.getAttribute('src')).toBe(url)
  })
})

/** A query of supabase-js: every method chains, awaiting it gives `result`. */
function query(result: { data: unknown; error: null }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'order', 'limit', 'upsert', 'delete', 'eq', 'in']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

// assistant-search, Requirement: Хранение фото
describe('a signed-in user’s photos', () => {
  function signedIn() {
    const userId = '11111111-1111-4111-8111-111111111111'
    const chatId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const path = `${userId}/${chatId}/${messageId}/0.webp`
    const row = {
      id: chatId,
      title: 'Фото',
      brief: {},
      question: null,
      unread: false,
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.002Z',
      messages: [
        {
          id: messageId,
          role: 'user',
          status: 'done',
          text: '',
          data: { attachments: [{ path, width: 1600, height: 1200 }] },
          createdAt: '2026-10-25T10:00:00.000Z',
        },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          status: 'pending',
          text: '',
          data: {},
          createdAt: '2026-10-25T10:00:00.002Z',
        },
      ],
    }
    // The photo comes from Storage a while later: the turn waits for it.
    let release!: () => void
    const downloaded = new Promise<void>((resolve) => (release = resolve))
    const download = vi.fn(async () => {
      await downloaded
      return { data: new Blob(['photo'], { type: 'image/webp' }), error: null }
    })
    let links = 0
    const createSignedUrls = vi.fn(async (paths: string[]) => {
      links += 1
      return {
        data: paths.map((p) => ({ path: p, signedUrl: `https://cdn.example/${p}?v=${links}`, error: null })),
        error: null,
      }
    })
    supabase.client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: userId, email: 'a@b.c' } } } }) },
      from: (table: string) => query({ data: table === 'assistant_chats' ? [row] : null, error: null }),
      storage: { from: () => ({ download, createSignedUrls }) },
    }
    fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'ask' } }))
    window.history.replaceState(null, '', `/assistant/${chatId}`)
    return { download, release: () => release(), path, createSignedUrls }
  }

  it('asks a pending answer with photos in Storage once after a reload', async () => {
    const { download, release, path } = signedIn()
    renderAssistant()

    await waitFor(() => expect(download).toHaveBeenCalled())
    // The chats change meanwhile (the signed links come): no second turn starts.
    await new Promise((resolve) => setTimeout(resolve, 50))
    release()
    expect(await within(log()).findByText(/Что сделать с фото\?/)).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
    expect(bodyOf(0).photos).toEqual([`data:image/webp;base64,${btoa('photo')}`])
    expect(
      within(log()).getByRole('button', { name: 'Открыть фото 1' }).querySelector('img')?.getAttribute('src'),
    ).toBe(`https://cdn.example/${path}?v=1`)
  })

  it('asks for new links before the old ones expire and shows the photo with them', async () => {
    const { release, path, createSignedUrls } = signedIn()
    // The page's timer for the links: run by hand instead of waiting for it.
    const timers = new Map<number, () => void>()
    const real = window.setInterval.bind(window)
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: () => void, delay?: number) => {
      if (delay !== SIGNED_URL_REFRESH_MS) return real(handler, delay)
      timers.set(timers.size + 1, handler)
      return timers.size
    }) as typeof window.setInterval)
    renderAssistant()
    release()
    const tile = async () => (await within(log()).findByRole('button', { name: 'Открыть фото 1' })).querySelector('img')
    await waitFor(async () => expect((await tile())?.getAttribute('src')).toBe(`https://cdn.example/${path}?v=1`))
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(timers.size).toBe(1)
    await act(async () => [...timers.values()].forEach((run) => run()))
    await waitFor(async () => expect((await tile())?.getAttribute('src')).toBe(`https://cdn.example/${path}?v=2`))
    expect(createSignedUrls).toHaveBeenCalledTimes(2)
  })

  it('starts no second turn when the page mounts again while the photos load', async () => {
    const { download, release } = signedIn()
    const { unmount } = renderAssistant()
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    // The first page goes (its turn is cancelled), a new one asks again.
    unmount()
    render(<AssistantSearch newHotels={newHotels} onChoose={() => ({})} />)
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2))
    release()
    expect(await within(log()).findByText(/Что сделать с фото\?/)).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// semantic-search, Requirement: Модели через API NVIDIA
describe('the rules instead of the models', () => {
  const DOWN = 'Модели сейчас недоступны, поэтому отвечаю по простым правилам. Попробуйте чуть позже — подберу точнее.'

  it('says so in a message of its own after the answer (Scenario: Ни одна модель не ответила)', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ brief: { destinationId: 'valencia' }, source: 'rules', modelsDown: true }),
    )
    const { user } = renderAssistant()
    await user.type(input(), 'хочу в Валенсию{Enter}')
    const warning = await within(log()).findByText(DOWN)
    const answerText = within(log()).getByText('Когда планируете поехать?')
    // The warning comes right after the answer.
    expect(answerText.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('stays quiet without the key (Scenario: Нет ключа)', async () => {
    fetchMock.mockResolvedValue(Response.json({ brief: { destinationId: 'valencia' }, source: 'rules' }))
    const { user } = renderAssistant()
    await user.type(input(), 'хочу в Валенсию{Enter}')
    expect(await within(log()).findByText('Когда планируете поехать?')).toBeTruthy()
    expect(within(log()).getByText('Город: Валенсия')).toBeTruthy()
    expect(within(log()).queryByText(DOWN)).toBeNull()
  })
})
