// Generates the demo routes with the assistant's model and writes them to src/data/generatedRoutes.json
// (and the places it proposed to src/data/extraHotels.json). One-off, not part of the build: read the result, then commit it.
//   npm run routes:generate                 makes the routes the file does not have yet
//   npm run routes:generate -- --only <id>  makes that route again
// Needs OPENROUTER_API_KEY (from .env.local); the key is never printed. OPENROUTER_MODEL overrides the model.
import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { parseArgs } from 'node:util'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, Output } from 'ai'
import { z } from 'zod'

// The app's modules import each other without extensions, as the bundler allows; Node needs `.ts`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})

const { destinations } = await import('../src/data/destinations.ts')
const { buildCatalog, extraHotelSchema, parseExtraHotels, slugify } = await import('../src/lib/catalogGenerator.ts')
const { distanceKm, parseRoute, PERSONA_LABEL } = await import('../src/lib/routes.ts')
type Route = import('../src/lib/routes.ts').Route
type Persona = import('../src/lib/routes.ts').Persona

const ROUTES_FILE = new URL('../src/data/generatedRoutes.json', import.meta.url)
const EXTRA_FILE = new URL('../src/data/extraHotels.json', import.meta.url)
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning:free'
const ATTEMPTS = 3

type Author = Route['author']
const person = (name: string): Author => ({ kind: 'person', name })
const editor: Author = { kind: 'editor' }

/** Three cities a persona, different within a persona; the authors split half and half with `prague-culture` (editor). */
const PLAN: { id: string; persona: Persona; destinationId: string; author: Author; brief: string }[] = [
  {
    id: 'tbilisi-student',
    persona: 'student',
    destinationId: 'tbilisi',
    author: person('Дарья Ковалёва'),
    brief: 'бюджетная неделя с друзьями: хостелы и недорогие апартаменты, дешёвая еда, бесплатные прогулки',
  },
  {
    id: 'istanbul-student',
    persona: 'student',
    destinationId: 'istanbul',
    author: editor,
    brief: 'студенческая поездка на 5–6 ночей: хостел, паромы, рынки, уличная еда, бесплатные виды',
  },
  {
    id: 'lisbon-student',
    persona: 'student',
    destinationId: 'lisbon',
    author: person('Артём Волков'),
    brief: 'бюджетный сёрф-уикенд: хостел, трамвай, океан, дешёвые таверны',
  },
  {
    id: 'rome-luxury',
    persona: 'luxury',
    destinationId: 'rome',
    author: editor,
    brief: 'роскошный романтический отпуск: пятизвёздочные отели или вилла, частные экскурсии, ужины высокой кухни',
  },
  {
    id: 'dubai-luxury',
    persona: 'luxury',
    destinationId: 'dubai',
    author: person('Марина Левина'),
    brief: 'люксовые выходные: лучший отель с видом, вилла, яхта, спа, ужин в небоскрёбе',
  },
  {
    id: 'marrakesh-luxury',
    persona: 'luxury',
    destinationId: 'marrakesh',
    author: editor,
    brief: 'утончённый отдых в рияде или на вилле: хаммам, частный гид, ужин на крыше',
  },
  {
    id: 'lisbon-workation',
    persona: 'workation',
    destinationId: 'lisbon',
    author: person('Игорь Назаров'),
    brief: 'две недели удалённой работы: быстрый Wi‑Fi, рабочее место, кофейни и коворкинги, вечерние прогулки',
  },
  {
    id: 'almaty-workation',
    persona: 'workation',
    destinationId: 'almaty',
    author: editor,
    brief: 'неделя работы и гор: апартаменты с рабочей зоной, быстрый интернет, выходные на канатной дороге и в горах',
  },
  {
    id: 'barcelona-workation',
    persona: 'workation',
    destinationId: 'barcelona',
    author: person('Екатерина Орлова'),
    brief: 'десять дней работы у моря: апартаменты с рабочим столом, коворкинг, пляж после работы',
  },
  {
    id: 'florence-culture',
    persona: 'culture',
    destinationId: 'florence',
    author: person('Сергей Бельский'),
    brief: 'искусство Ренессанса: галереи, соборы, мастерские, ужин с вином в Кьянти',
  },
  {
    id: 'tokyo-culture',
    persona: 'culture',
    destinationId: 'tokyo',
    author: editor,
    brief: 'традиции и современность: храмы, чайная церемония, театр, музей, старый квартал',
  },
]

const TONES = 4

const proposalSchema = z.object({
  title: z.string().describe('название маршрута по-русски, до 60 символов'),
  description: z.string().describe('2–3 предложения по-русски о том, чем маршрут хорош'),
  coverCaption: z.string().describe('подпись к обложке по-русски, до 60 символов'),
  arrival: z.object({ name: z.string(), lat: z.number(), lon: z.number(), time: z.string().describe('HH:MM') }),
  departure: z.object({ name: z.string(), lat: z.number(), lon: z.number(), time: z.string().describe('HH:MM') }),
  stops: z
    .array(z.object({ hotelId: z.string(), nights: z.number().int() }))
    .describe('1–3 остановки, всего 3–7 ночей'),
  transfers: z
    .array(z.enum(['transfer', 'taxi', 'car', 'walk']))
    .describe('режим каждого перегона: на один больше, чем остановок'),
  leisure: z
    .array(
      z.object({
        title: z.string(),
        category: z.string().describe('Экскурсия, Музей, Концерт, Прогулка, Гастрономия, Спа…'),
        day: z.number().int().describe('день поездки, 1 — день прибытия'),
        time: z.string().describe('HH:MM'),
        minutes: z.number().int(),
        price: z.number().int().describe('₽, 0 — бесплатно'),
      }),
    )
    .describe('5–8 занятий'),
  extraHotels: z.array(extraHotelSchema).describe('новые объекты, только если в списке нет подходящего; иначе []'),
})
type Proposal = z.infer<typeof proposalSchema>

const catalog = buildCatalog()
const readJson = <T>(url: URL, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(url, 'utf8')) as T
  } catch {
    return fallback
  }
}

function prompt(entry: (typeof PLAN)[number], error?: string) {
  const destination = destinations.find((d) => d.id === entry.destinationId)!
  const stays = catalog
    .filter((h) => h.destinationId === destination.id)
    .map(
      (h) =>
        `${h.id} | ${h.name} | ${h.stayType} | ${h.stayType === 'hotel' || h.stayType === 'hostel' ? `${h.stars}★` : '—'} | от ${h.priceFrom} ₽ | Wi‑Fi ${h.wifiMbps} Мбит/с | ${h.workspace ? 'есть рабочее место' : 'нет рабочего места'} | рейтинг ${h.rating}`,
    )
    .join('\n')
  return [
    'Ты редактор сервиса путешествий «О!Погнали». Составь готовый маршрут по городу для персоны, на русском языке.',
    `Персона: ${PERSONA_LABEL[entry.persona]} (${entry.persona}). Город: ${destination.name}, ${destination.country}. Идея: ${entry.brief}.`,
    `Города: ${destination.name} в точке ${destination.lat}, ${destination.lon}. Прибытие и отъезд — аэропорт или вокзал города с реальными координатами и временем HH:MM.`,
    `Отели города (id | название | тип | звёзды | цена за ночь | Wi‑Fi | рабочее место | рейтинг):\n${stays}`,
    'Правила: hotelId в остановках — строго из списка или из твоего extraHotels (id нового объекта = "<destinationId>-<название латиницей через дефис в нижнем регистре>").',
    'Если в списке нет подходящего для персоны объекта (вилла для luxury, апартаменты с рабочим местом для workation, хостел для student), предложи его в extraHotels: цена не ниже ' +
      `${destination.priceFrom} ₽, destinationId = "${destination.id}"; иначе extraHotels = [].`,
    'Всего 3–7 ночей, по 1–3 остановки; transfers: ровно остановок + 1 элементов (прибытие → остановка 1 → … → отъезд); day у занятий от 1 до числа ночей + 1; цены занятий в рублях, правдоподобные для города; время HH:MM.',
    'Занятия распределены по дням, не более трёх в день, без пересечений по времени; названия реальных мест города.',
    error ? `Предыдущий ответ отклонён: ${error}\nИсправь.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The route of the proposal, or throws with what is wrong. */
function assemble(
  entry: (typeof PLAN)[number],
  index: number,
  proposal: Proposal,
): { route: Route; extras: Proposal['extraHotels'] } {
  const destination = destinations.find((d) => d.id === entry.destinationId)!
  const extras = parseExtraHotels(proposal.extraHotels)
  for (const extra of extras)
    if (extra.destinationId !== destination.id) throw new Error(`объект ${extra.name} не в городе ${destination.name}`)
  const ids = new Set([...catalog.map((h) => h.id), ...extras.map((e) => `${e.destinationId}-${slugify(e.name)}`)])
  const route = parseRoute(
    {
      id: entry.id,
      persona: entry.persona,
      destinationId: entry.destinationId,
      title: proposal.title,
      author: entry.author,
      description: proposal.description,
      cover: { id: `${entry.id}-cover`, caption: proposal.coverCaption, tone: index % TONES },
      arrival: proposal.arrival,
      departure: proposal.departure,
      stops: proposal.stops,
      transfers: proposal.transfers,
      leisure: proposal.leisure,
    },
    (id) => ids.has(id),
  )
  for (const place of [route.arrival, route.departure])
    if (distanceKm(place, destination) > 150)
      throw new Error(`${place.name} далеко от города (${distanceKm(place, destination)} км)`)
  const nights = route.stops.reduce((sum, stop) => sum + stop.nights, 0)
  if (nights < 3 || nights > 14) throw new Error(`ночей ${nights}, нужно 3–14`)
  if (route.leisure.length < 4) throw new Error('занятий меньше 4')
  for (const item of route.leisure) {
    if (item.day > nights + 1) throw new Error(`занятие «${item.title}» в день ${item.day}, а дней ${nights + 1}`)
    if (!item.minutes) throw new Error(`у занятия «${item.title}» нет длительности`)
  }
  for (const stop of route.stops) {
    const hotel = catalog.find((h) => h.id === stop.hotelId)
    if (hotel && hotel.destinationId !== destination.id)
      throw new Error(`отель ${stop.hotelId} не в городе ${destination.name}`)
  }
  return { route, extras }
}

const { values: options } = parseArgs({ options: { only: { type: 'string' }, proposals: { type: 'string' } } })
// --proposals <file.json>: answers by route id, written beforehand (a free model's daily limit ran out); the same checks apply.
const written = options.proposals
  ? (JSON.parse(readFileSync(options.proposals, 'utf8')) as Record<string, unknown>)
  : undefined
const apiKey = process.env.OPENROUTER_API_KEY
if (!written && !apiKey) throw new Error('OPENROUTER_API_KEY is not set: run npm run secrets:reveal')
const model = apiKey ? createOpenRouter({ apiKey })(process.env.OPENROUTER_MODEL || DEFAULT_MODEL) : undefined

const routes = readJson<Route[]>(ROUTES_FILE, [])
const extraHotels = readJson<Proposal['extraHotels']>(EXTRA_FILE, [])
const todo = PLAN.map((entry, index) => ({ entry, index })).filter(({ entry }) =>
  options.only ? entry.id === options.only : !routes.some((r) => r.id === entry.id),
)

for (const { entry, index } of todo) {
  let error: string | undefined
  let done = false
  for (let attempt = 1; attempt <= ATTEMPTS && !done; attempt++) {
    try {
      const output = written
        ? proposalSchema.parse(written[entry.id])
        : (
            await generateText({
              model: model!,
              prompt: prompt(entry, error),
              output: Output.object({ schema: proposalSchema }),
            })
          ).output
      const { route, extras } = assemble(entry, index, output)
      const at = routes.findIndex((r) => r.id === route.id)
      if (at >= 0) routes[at] = route
      else routes.push(route)
      for (const extra of extras) {
        const id = `${extra.destinationId}-${slugify(extra.name)}`
        if (
          !extraHotels.some((e) => `${e.destinationId}-${slugify(e.name)}` === id) &&
          !catalog.some((h) => h.id === id)
        )
          extraHotels.push(extra)
      }
      done = true
      console.log(`${entry.id}: ok (попытка ${attempt}, доп. отелей ${extras.length})`)
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 600) : String(e)
      console.log(`${entry.id}: попытка ${attempt} отклонена: ${error.split('\n')[0]}`)
    }
  }
  if (!done) console.log(`${entry.id}: пропущен после ${ATTEMPTS} попыток`)
  // Written after every route: a long run keeps what it has made.
  writeFileSync(ROUTES_FILE, `${JSON.stringify(routes, null, 2)}\n`)
  writeFileSync(EXTRA_FILE, `${JSON.stringify(extraHotels, null, 2)}\n`)
}
console.log(`${routes.length} маршрутов, доп. отелей: ${extraHotels.length}`)
