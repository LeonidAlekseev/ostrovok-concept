import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '../catalogGenerator'
import type { ToolResult } from '../toolResult'
import { placesAnswer } from './mediatorPlaces'

const steps = vi.hoisted(() => ({
  noise: null as unknown,
  view: null as unknown,
  geo: null as unknown,
}))
vi.mock('./noiseTool', () => ({ runNoiseTool: async () => steps.noise }))
vi.mock('./viewTurn', () => ({ viewTurn: async () => steps.view }))
vi.mock('./geoTurn', () => ({ geoTurn: async () => steps.geo }))

const hotel = getHotel('prague-old-town-lantern')!
const options = { details: null, deadline: Date.now() + 10_000, signal: new AbortController().signal }
const ask = (text: string) => placesAnswer(hotel, [{ sender: 'user', text }], options)

const noiseRun = (claims: ToolResult['claims']): ToolResult => ({
  status: 'success',
  summary: 'Шум у отеля',
  data: null,
  evidence: [],
  claims,
  calculations: [],
  method: null,
  limitations: ['Оценка, не замер'],
  error: null,
})

beforeEach(() => {
  steps.noise = null
  steps.view = null
  steps.geo = null
})

// hotelier-chat, Requirement: the assistant knows what Эвал knows of the hotel
describe('the assistant’s knowledge of the hotel’s places', () => {
  it('answers the beach by the geo steps, naming the datasets it read', async () => {
    steps.geo = {
      planner: 'rules',
      summary: 'По данным OpenStreetMap: «Platja del Cabanyal», 2,6 км от отеля по прямой.',
      steps: [
        { agent: 'geo', title: 'Смотрю места рядом по данным Островка', status: 'done', result: 'пляж — 0' },
        { agent: 'geo', title: 'Ищу рядом с отелем: пляж — в радиусе 5 км', status: 'done', result: 'пляж — 3' },
      ],
    }
    const answer = await ask('Сколько идти до пляжа?')
    expect(answer?.answer).toContain('2,6 км')
    expect(answer?.result.evidence.map((e) => e.source_name)).toEqual(['Островок', 'OpenStreetMap'])
    expect(answer?.result.limitations.join(' ')).toContain('оценка')
  })

  it('answers the noise with the estimates of the noise tool and its block', async () => {
    steps.noise = noiseRun([
      {
        id: 'n1',
        label: 'Фасад на улицу, ночью',
        value: '≈76 дБ',
        status: 'derived',
        confidence: null,
        evidence_ids: [],
        calculation_id: null,
      },
    ])
    const answer = await ask('Тихо ли ночью?')
    expect(answer?.answer).toContain('≈76 дБ')
    expect(answer?.result.limitations[1]).toBe('Оценка, не замер')
  })

  it('has nothing to say without data: the noise tool failed or the geo steps found no place', async () => {
    steps.noise = noiseRun([])
    expect(await ask('Шумно ли ночью?')).toBeNull()
    steps.geo = null
    expect(await ask('Сколько идти до пляжа?')).toBeNull()
    expect(await ask('Есть ли парковка?')).toBeNull()
  })

  it('answers the view by the view steps only when the building was read', async () => {
    steps.view = {
      planner: 'rules',
      summary: 'Из отеля: море не видно ни с одного этажа.',
      steps: [{ agent: 'geo', title: 'Смотрю этажи отеля: здание EUBUCCO и номера Островка', status: 'done' }],
    }
    expect((await ask('Видно ли море из окна?'))?.result.evidence.map((e) => e.source_name)).toContain('EUBUCCO')
    steps.view = {
      planner: 'rules',
      summary: 'Нет точных данных.',
      steps: [{ agent: 'geo', title: 'Смотрю этажи отеля: здание EUBUCCO и номера Островка', status: 'failed' }],
    }
    expect(await ask('Видно ли море из окна?')).toBeNull()
  })
})
