import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHATS_KEY, newChat, type Chat } from '../../lib/assistantChats'
import { newHotels } from '../../lib/catalogGenerator'
import { catalogFetch } from '../../test/catalog'
import { AssistantSearch } from './AssistantSearch'
import { SharedChat } from './SharedChat'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
beforeEach(() => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === THINK_MS ? 0 : ms, ...args)) as typeof setTimeout)
})

afterEach(() => {
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
  it('sends two photos with the message and clears the field (Scenario: Отправка фото)', async () => {
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
  })

  it('sends the words and the photos together', async () => {
    fetchMock.mockResolvedValue(answer({ brief: {}, photo: { action: 'unseen' } }))
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'найди похожий{Enter}')
    expect(await within(log()).findByText(/Не смог рассмотреть фото/)).toBeTruthy()
    expect(bodyOf(0).messages).toEqual([{ role: 'user', text: 'найди похожий' }])
    expect(bodyOf(0).photos).toHaveLength(1)
  })

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
    expect(within(log()).getByText('Ищу отели, похожие на фото — нашёл 2')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Быстрые ответы' })).toBeNull()
  })

  it('tells what it saw before the brief when the photo went into the wish', async () => {
    fetchMock.mockResolvedValue(
      answer({ brief: { view: 'sea' }, photo: { action: 'refine', seen: 'Вид на море с балкона' } }),
    )
    const { user } = renderAssistant()
    await user.upload(picker(), photo('a.jpg'))
    await user.type(input(), 'учти{Enter}')
    expect(await within(log()).findByText(/^Вижу на фото: Вид на море с балкона\. Записал: вид на море\./)).toBeTruthy()
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
