import type { ToolResult } from '@/lib/toolResult'

/** A result of the noise tool: one band from EEA's dataset, one review, the day estimate with its calculation. */
export const sampleResult: ToolResult = {
  status: 'success',
  summary: 'Ночью 55–59 дБ (дороги города), днём оценка 55–63 дБ',
  data: { eea: true, places: 4, reviews: 1 },
  evidence: [
    {
      id: '6f0f3c1e-8a51-4b4e-9d61-2f6b1b0c0a01',
      source_type: 'dataset',
      source_name: 'EEA',
      source_id: 'eea-noise-end2022-v01_r00',
      source_url:
        'https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00',
      title: 'EEA noise contours, Environmental Noise Directive, round 2022 v01_r00',
      excerpt: null,
      retrieved_at: '2026-10-26T18:06:03.471+00:00',
      entity_id: 'ota-9096882',
      claim_id: null,
    },
    {
      id: '6f0f3c1e-8a51-4b4e-9d61-2f6b1b0c0a02',
      source_type: 'review',
      source_name: 'Островок',
      source_id: '253866',
      source_url: null,
      title: 'Отзыв гостя от 2018-09-24',
      excerpt: 'Тонкие стены из-за чего очень шумно.',
      retrieved_at: '2026-10-26T19:43:48.681+00:00',
      entity_id: 'ota-9096882',
      claim_id: null,
    },
  ],
  claims: [
    {
      id: 'c-night',
      label: 'Ночью (Lnight): дороги города',
      value: '55–59 дБ',
      status: 'reported',
      confidence: null,
      evidence_ids: ['6f0f3c1e-8a51-4b4e-9d61-2f6b1b0c0a01'],
      calculation_id: null,
    },
    {
      id: 'c-day',
      label: 'Днём (07:00–19:00), оценка: дороги города',
      value: '55–63 дБ',
      status: 'derived',
      confidence: null,
      evidence_ids: ['6f0f3c1e-8a51-4b4e-9d61-2f6b1b0c0a01'],
      calculation_id: 'calc-day',
    },
  ],
  calculations: [
    {
      id: 'calc-day',
      name: 'Директива ЕС 2002/49/EC, приложение I: Lday из Lden и Lnight',
      version: '1',
      inputs: [
        { label: 'Lden (сутки)', value: '60–64 дБ' },
        { label: 'Lnight (ночь)', value: '55–59 дБ' },
      ],
      assumptions: ['Допущение: вечер так же громок, как день'],
    },
  ],
  method: {
    name: 'Сводка данных о шуме',
    version: '1',
    inputs: [{ label: 'Отель', value: 'ota-9096882' }],
    assumptions: [],
  },
  limitations: ['Нет данных EEA — не значит «тихо»'],
  error: null,
}

/** The id of the sample's run. */
export const RUN_ID = '0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e'
