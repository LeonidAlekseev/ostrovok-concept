import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHATS_KEY, newChat, type Chat, type ChatMessage } from '../../lib/assistantChats'
import { newHotels } from '../../lib/catalogGenerator'
import { errorResult, type ToolResult, type ToolRun } from '../../lib/toolResult'
import { catalogFetch } from '../../test/catalog'
import { RUN_ID, groupedResult, sampleResult } from '../../test/toolResult'
import { AssistantSearch } from './AssistantSearch'
import { ToolRunCard } from './ChatCards'
import { SharedChat } from './SharedChat'
import { mergeSteps } from './useChats'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const step = { agent: 'features', title: 'Анализ шума', params: 'карты шума EEA, места OpenStreetMap, отзывы гостей' }
const runOf = (result: ToolResult = sampleResult, id = RUN_ID): ToolRun => ({ id, result })

const open = async (name = 'Источники и данные: Анализ шума') => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name }))
  return user
}

afterEach(() => {
  window.localStorage.clear()
})

// assistant-search, Requirement: Блок запуска инструмента
describe('the block of a tool’s run', () => {
  it('shows what the tool does, its status and its summary, the details closed', () => {
    render(<ToolRunCard step={step} run={runOf()} />)
    expect(screen.getByText('Анализ шума')).toBeTruthy()
    expect(screen.getByText(step.params)).toBeTruthy()
    expect(screen.getByText('Готово')).toBeTruthy()
    expect(screen.getByText(sampleResult.summary)).toBeTruthy()
    expect(screen.queryByText('Полученные характеристики')).toBeNull()
    expect(screen.getByRole('button', { name: 'Источники и данные: Анализ шума' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('shows the characteristics by hotel, the long list opening with a button', async () => {
    const choice = { agent: 'features', title: 'Отели по характеристикам', params: 'ночью тише 50 дБ' }
    const result: ToolResult = {
      ...groupedResult,
      claims: groupedResult.claims.map((c, i) => (i === 0 ? { ...c, confidence: 0.9 } : c)),
    }
    const { container } = render(<ToolRunCard step={choice} run={runOf(result)} />)
    const user = await open('Источники и данные: Отели по характеристикам')
    expect(screen.getByText('По отелям')).toBeTruthy()
    const quiet = container.querySelector('[data-group="ota-1"]') as HTMLElement
    expect(within(quiet).getByText('Hotel Quiet')).toBeTruthy()
    expect(within(quiet).getByText('Ночь: подходит')).toBeTruthy()
    expect(within(quiet).getByText('55–59 дБ')).toBeTruthy()
    expect(within(quiet).getByText('сообщено источником · уверенность 90 % · источник: EEA')).toBeTruthy()
    // The claims of the groups are not repeated in the common list.
    expect(screen.queryByText('Полученные характеристики')).toBeNull()
    // Three hotels first; the rest and the hotels without data open with the button.
    expect(screen.queryByText('Hotel Fourth')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Показать все (5)' }))
    expect(screen.getByText('Hotel Fourth')).toBeTruthy()
    expect(screen.getByText('Данных по этим характеристикам в хранилище нет: Hotel Unknown')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Свернуть' }))
    expect(screen.queryByText('Hotel Fourth')).toBeNull()
    expect(container.textContent).not.toMatch(/hotels_by_features|claim_ids|\{"/)
  })

  it('opens «Источники и данные»: the characteristics with their origin, the calculation, the sources', async () => {
    const { container } = render(<ToolRunCard step={step} run={runOf()} />)
    await open()
    expect(screen.getByText('Полученные характеристики')).toBeTruthy()
    expect(screen.getByText('сообщено источником · источник: EEA')).toBeTruthy()
    expect(screen.getByText('рассчитано · источник: EEA')).toBeTruthy()
    // A null confidence shows no number.
    expect(container.textContent).not.toMatch(/уверенность/)
    expect(screen.getByText(/Директива ЕС 2002\/49\/EC/)).toBeTruthy()
    expect(screen.getByText('Входные данные: Lden (сутки) — 60–64 дБ; Lnight (ночь) — 55–59 дБ')).toBeTruthy()
    expect(screen.getByText('Допущения: Допущение: вечер так же громок, как день')).toBeTruthy()
    expect(screen.getByText('Набор данных · ID: eea-noise-end2022-v01_r00 · получено 26 октября 2026 г.')).toBeTruthy()
    expect(screen.getByText('Тонкие стены из-за чего очень шумно.').tagName).toBe('BLOCKQUOTE')
    expect(screen.getByText('Нет данных EEA — не значит «тихо»')).toBeTruthy()
    // No JSON, no names of functions, no tool's machine name.
    expect(container.textContent).not.toMatch(/noise_analysis|evidence_ids|\{"/)
  })

  it('opens the links of the sources in a new tab, safely; a review without a link has none', async () => {
    render(<ToolRunCard step={step} run={runOf()} />)
    await open()
    const link = screen.getByRole('link', { name: sampleResult.evidence[0].title })
    expect(link.getAttribute('href')).toBe(sampleResult.evidence[0].source_url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByRole('link', { name: 'Отзыв гостя от 2018-09-24' })).toBeNull()
  })

  it('renders a source’s words as text, never as HTML, and no link that is not http(s)', async () => {
    const hostile: ToolResult = {
      ...sampleResult,
      evidence: [
        { ...sampleResult.evidence[0], source_url: 'javascript:alert(1)' },
        { ...sampleResult.evidence[1], excerpt: '<img src=x onerror="alert(1)"><b>жирно</b>' },
      ],
    }
    const { container } = render(<ToolRunCard step={step} run={runOf(hostile)} />)
    await open()
    expect(container.querySelector('img, b, script')).toBeNull()
    expect(screen.getByText('<img src=x onerror="alert(1)"><b>жирно</b>')).toBeTruthy()
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(screen.queryAllByRole('link')).toEqual([])
  })

  it('says there are no sources rather than showing none (Scenario: Источников нет)', async () => {
    render(<ToolRunCard step={step} run={runOf({ ...sampleResult, evidence: [], claims: [], calculations: [] })} />)
    await open()
    expect(screen.getByText('Источников нет: инструмент не нашёл данных с источником.')).toBeTruthy()
  })

  it('shows a confidence that has a basis', async () => {
    const confident = { ...sampleResult, claims: [{ ...sampleResult.claims[0], confidence: 0.8 }] }
    render(<ToolRunCard step={step} run={runOf(confident)} />)
    await open()
    expect(screen.getByText('сообщено источником · уверенность 80 % · источник: EEA')).toBeTruthy()
  })

  it('shows an error and a run at work (Scenario: Ошибка инструмента)', async () => {
    const { unmount } = render(
      <ToolRunCard step={step} run={runOf(errorResult('store_unavailable', 'Хранилище недоступно'))} />,
    )
    expect(screen.getByText('Ошибка')).toBeTruthy()
    await open()
    expect(screen.getAllByText('Хранилище недоступно').length).toBeGreaterThan(0)
    unmount()
    render(<ToolRunCard step={step} run={runOf({ ...sampleResult, status: 'running', summary: '' })} />)
    expect(screen.getByText('Выполняется')).toBeTruthy()
    expect(document.querySelector('.motion-safe\\:animate-spin')).toBeTruthy()
  })

  it('keeps each block’s state its own', async () => {
    const other = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
    render(
      <>
        <ToolRunCard step={step} run={runOf()} />
        <ToolRunCard step={{ ...step, title: 'Анализ шума 2' }} run={runOf(sampleResult, other)} />
      </>,
    )
    await open()
    const [first, second] = screen.getAllByRole('button', { name: /^Источники и данные/ })
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(second.getAttribute('aria-expanded')).toBe('false')
  })
})

const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const agentStep = (run: ToolRun, minutes = 4, status: ChatMessage['status'] = 'done'): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'agent',
  status,
  text: '',
  data: { step: { ...step, run } },
  createdAt: at(minutes),
})

describe('the runs in the feed', () => {
  it('updates a run’s block in place by its id, and adds another run as a block of its own', () => {
    const first = agentStep(runOf({ ...sampleResult, status: 'running', summary: '' }))
    const done = agentStep(runOf())
    const other = agentStep(runOf(sampleResult, '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'))
    const merged = mergeSteps([first], [done, other])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ id: first.id, createdAt: first.createdAt })
    expect(merged[0].data.step!.run!.result.status).toBe('success')
    expect(merged[1]).toBe(other)
    expect(mergeSteps(merged, [done])).toHaveLength(2)
  })

  // assistant-search, Requirement: Восстановление блоков инструментов
  it('opens the block of a chat after a reload, from the guest’s storage (Scenario: Перезагрузка)', async () => {
    vi.stubGlobal('fetch', ((input) => catalogFetch(input)) as typeof fetch)
    const chat: Chat = {
      ...newChat(at(5)),
      title: 'Шум',
      brief: { hotelId: 'prague-old-town-lantern' },
      messages: [
        { id: crypto.randomUUID(), role: 'user', status: 'done', text: 'Шумно?', data: {}, createdAt: at(6) },
        agentStep(runOf()),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          status: 'done',
          text: 'Ночью шумно.',
          data: {},
          createdAt: at(3),
        },
      ],
    }
    window.localStorage.setItem(CHATS_KEY, JSON.stringify([chat]))
    window.history.replaceState(null, '', `/assistant/${chat.id}`)
    render(<AssistantSearch newHotels={newHotels} onChoose={vi.fn()} />)
    const log = await screen.findByRole('log', { name: 'Диалог с Эвалом' })
    await waitFor(() => expect(within(log).getByText(sampleResult.summary)).toBeTruthy())
    await open()
    expect(within(log).getByText('Тонкие стены из-за чего очень шумно.')).toBeTruthy()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/assistant')
  })

  it('opens the block in a shared snapshot (Scenario: Снимок с источниками)', async () => {
    render(
      <SharedChat share={{ id: RUN_ID, title: 'Шум', brief: {}, messages: [agentStep(runOf())], createdAt: at(1) }} />,
    )
    await open()
    expect(screen.getByRole('link', { name: sampleResult.evidence[0].title })).toBeTruthy()
  })
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
