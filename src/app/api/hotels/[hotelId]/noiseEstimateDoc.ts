import { ESTIMATE_LIMITATIONS } from '@/lib/claimRows'
import { CONFIDENCE } from '@/lib/confidence'
import { NOISE_ESTIMATE_METHOD, NOISE_ESTIMATE_NOTES, VENUE_LEVELS, noiseSourceLabel } from '@/lib/noise'

/**
 * How the noise at the hotel's facade is computed (noise-estimate-v2), for the descriptions of `/api/docs`: the
 * method, the formulas, the parameters and the limitations, from the same constants the estimate uses.
 */

const db = (level: number | undefined) => (level === undefined ? '—' : String(level))
const LABEL: Record<keyof typeof VENUE_LEVELS, string> = {
  nightclub: 'ночной клуб',
  bar: 'бар, паб',
  restaurant: 'ресторан',
  cafe: 'кафе',
  fast_food: 'фастфуд',
}

export const NOISE_ESTIMATE_DOC = [
  `**Оценка шума у фасада (\`${NOISE_ESTIMATE_METHOD}\`)** — утверждения \`noise.estimate.*\` (\`street\` — фасад на улицу, \`yard\` — окна во двор, \`facade\` — только карты EEA у фасада, \`venues\` — только заведения; периоды \`lday\`, \`levening\`, \`lnight\`, \`lden\`) и колонки \`street_*\`, \`yard_*\` таблицы \`hotel_features\`. Значение — диапазон в дБ (\`min\`/\`max\`; \`null\` — открытый конец), у вклада заведений — число.`,
  ...NOISE_ESTIMATE_NOTES.map((line) => `- ${line}`),
  '',
  'Опорные уровни заведений на 10 м, дБ:',
  '',
  '| Вид | День 07–19 | Вечер 19–23 | Ночь 23–07 |',
  '| --- | --- | --- | --- |',
  ...Object.entries(VENUE_LEVELS).map(([kind, levels]) => {
    const l: { day?: number; evening?: number; night?: number } = levels
    return `| ${LABEL[kind as keyof typeof VENUE_LEVELS]} | ${db(l.day)} | ${db(l.evening)} | ${db(l.night)} |`
  }),
  '',
  `Источники EEA: ${['roadsInAgglomeration', 'majorRoadsIncludingAgglomeration', 'railwaysInAgglomeration', 'majorRailwaysIncludingAgglomeration', 'majorAirportsIncludingAgglomeration', 'industryInAgglomeration'].map(noiseSourceLabel).join(', ')}.`,
  `Уверенность (политика \`confidence-1\`): полосы у фасада ${CONFIDENCE.facade_band}, день и вечер у фасада ${CONFIDENCE.facade_day}, вклад заведений ${CONFIDENCE.venue_level}, итог с заведениями ${CONFIDENCE.noise_estimate} (день и вечер ${CONFIDENCE.noise_estimate_day}), итог без заведений рядом ${CONFIDENCE.noise_estimate_no_places} (${CONFIDENCE.noise_estimate_no_places_day}).`,
  '',
  'Ограничения:',
  ...ESTIMATE_LIMITATIONS.map((line) => `- ${line}`),
].join('\n')
