# ostrovok-concept

Островок! - концепт агрегатора в сфере онлайн-бронирования жилья

Главная страница сервиса бронирования отелей (Next.js 16 App Router + React 19 + TypeScript).

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production-сборка (страница пререндерится статически)
npm run start      # запуск собранной версии
npm run lint
npm run typecheck
npm test
npm run format:check
```

Для `npm run dev` и `npm run build` нужны `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(сборка читает каталог из базы и без них останавливается). Остальные имена — в `.env.example`; значения достаёт
`npm run secrets:reveal` (создаёт `.env.local`, см. «Ключи API»). Для ИИ-ответов нужен `NVIDIA_API_KEY`, без него
помощник отвечает по правилам. Тесты и lint ключей не требуют.

CI (GitHub Actions, `.github/workflows/ci.yml`) на каждый PR и push в `dev` и `main` запускает
`npm ci`, `npm run lint`, `npm run typecheck`, `npm test` и `npm run format:check` в job `checks`
(проверка `CI / checks`). Сборку в CI не запускают: её выполняет Vercel.

## Деплой на Vercel

Vercel определяет проект как Next.js без дополнительной настройки:
импортируйте репозиторий (Framework Preset — Next.js, команды по умолчанию)
или выполните `npx vercel --prod` из корня. Нужен Node.js ≥ 20.9.
В настройках проекта Vercel нужна одна переменная — `GIT_SECRET_PRIVATE_KEY` (см. «Ключи API»).

Вне production (`npm run dev` и preview-деплои Vercel, по `VERCEL_ENV`) в левом нижнем углу
показываются технические параметры глобуса: fps, время кадра, разрешение рендера,
объём геометрии. Проверить production-сборку с ними локально: `VERCEL_ENV=preview npm run build`.

## Ключи API

Ключи API (Supabase, NVIDIA) хранятся в репозитории зашифрованными через
[git-secret](https://github.com/sobolevn/git-secret): в git лежит только `.env.local.secret`, открытые `.env*`
(кроме `.env.example` с именами переменных) и закрытые ключи в `.gitignore`. Файл зашифрован для ключа GPG проекта
`secrets@opognali.local` (без пароля) и ключей людей, добавленных через `git secret tell`.

- **Раскрыть** — `npm run secrets:reveal` создаёт `.env.local`: с переменной `GIT_SECRET_PRIVATE_KEY` (закрытый ключ
  в armored-виде, `\n` можно экранировать) расшифровывает пакетом `openpgp`, без неё — через `git secret reveal -f`
  (нужны git-secret и закрытый ключ в `gpg`). Без ключа и git-secret ничего не делает.
- **Добавить или сменить ключ** — правка `.env.local`, затем `npm run secrets:hide` (`git secret hide`) и коммит
  `.env.local.secret`. Новое имя переменной — ещё и в `.env.example`.
- **Добавить человека** — импорт его открытого ключа (`gpg --import`), `git secret tell <email>`, затем
  `npm run secrets:hide` и коммит `.gitsecret/` и `.env.local.secret`. Убрать — `git secret removeperson <email>`,
  `npm run secrets:hide` и смена самих ключей API: старые копии файла остаются в истории git.
- **Сборка** — `prebuild` (`node scripts/secrets.mjs build`) при наличии `GIT_SECRET_PRIVATE_KEY` пишет
  `.env.production.local`, из которого `next build` встраивает `NEXT_PUBLIC_*`; `.env.local` при этом не трогается.
  Без ключа (CI) шаг пропускается, сборка и тесты проходят.
- **Сервер** — `getSecret(name)` из `src/lib/secrets.ts` (`server-only`) берёт `process.env[name]`, иначе один раз на
  холодный старт расшифровывает `.env.local.secret` (файл попадает в функции Vercel через `outputFileTracingIncludes`
  в `next.config.ts`). Нет ключа — `undefined`, код работает в режиме без ключей. Клиент серверные ключи не получает.
- **Сменить ключ проекта** — новый ключ GPG, `git secret removeperson secrets@opognali.local`, `git secret tell` нового,
  `npm run secrets:hide`, новый закрытый ключ — в `GIT_SECRET_PRIVATE_KEY` на Vercel.

## Supabase

Постоянные данные — в Supabase: аккаунты (`profiles`) и каталог (`destinations`, `hotels`: ключевые колонки, порядок
`position` и весь объект в `data jsonb`). Схема с RLS — `supabase/migrations/`: каталог читают все, пишет только
сервисный ключ, профиль читает и меняет владелец.

**Каталог в Supabase.** Интерфейс читает его на сервере через `src/lib/db/catalog.ts` (`server-only`, anon-ключ под
RLS): `loadDestinations`, `loadHotelSummaries`, `loadNewHotels`, `loadHotel`, `loadHotels(ids)`,
`loadCityHotels(destinationIds)`, `loadAllHotels`. Чтения кешируются `unstable_cache` с тегом `catalog` на час
(`CATALOG_LIFETIME`; полные отели — по городу на запись кеша); страницы с ними перестраиваются в фоне так же часто.
Ошибка базы — `CatalogUnavailableError`: страница показывает «Не удалось загрузить страницу» с «Повторить»
(`src/app/error.tsx`, `global-error.tsx`), API — 503. Клиент получает только нужное: направления — из корневого
layout (`CatalogProvider`, `useDestinations`), главная — новые отели и подборки пропсами, «Поиск вайба» и «Звёзды
подскажут» считают на сервере (server actions), остальное — `GET /api/hotels?ids=a,b` (избранное, поездки, бронь) или
`?destinations=x,y` (результаты, карта отеля): до 60 `id`, полные отели, `Cache-Control: s-maxage=300`. Отель,
добавленный в базу после сборки, открывается без пересборки: `/hotels/<id>` рендерится при первом запросе и
кешируется. Генератор `src/lib/catalogGenerator.ts` — источник `db:seed` и фикстура тестов (`src/test/catalog.ts`),
в бандлы сайта не попадает. **После изменения данных** — `npm run db:seed`, затем ревалидация:
`npm run db:seed -- --revalidate https://<сайт>` (или `POST /api/revalidate` с `Authorization: Bearer
<SUPABASE_SERVICE_ROLE_KEY>`), иначе сайт обновится сам в течение часа. Сборка читает базу: без ключей она
останавливается с «нет NEXT_PUBLIC_SUPABASE_URL…: npm run secrets:reveal».

- `npm run db:types` — `scripts/db-types.mjs`: `supabase gen types typescript` по базе (`SUPABASE_DB_URL` из `.env.local`, схема
  только читается) в `src/lib/db/database.types.ts`, затем Prettier. Клиенты Supabase типизированы `Database`. **Перегенерируйте
  после каждой миграции** (`db:push`) и коммитьте файл вместе с ней.
- `npm run db:push` — применяет миграции (`supabase db push --db-url "$SUPABASE_DB_URL"`, строка из `.env.local`).
  Прямой адрес `db.<ref>.supabase.co` доступен только по IPv6; без IPv6 подставьте строку пулера
  (Dashboard → Connect → Transaction pooler, порт 6543) в `SUPABASE_DB_URL` окружения.
- `npm run db:seed` — `scripts/seed.ts` (Node исполняет TypeScript сам): строит каталог генератором
  `src/lib/catalogGenerator.ts` (с порядком `position`), делает upsert пачками по 100 и печатает число строк; повторный запуск оставляет те же строки.
  Создаёт демо-аккаунт «Демо-путешественник» из `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`, если его нет.
  `SUPABASE_SERVICE_ROLE_KEY` читают только этот скрипт и сервер, никогда клиент.
- `npm run db:seed:valencia -- <search.json>` — `scripts/seed-valencia.ts`: выдача Островка по Валенсии. Сырые отели
  кладёт в `ota_hotels` (ключ `master_id`, уникальный `ota_hotel_id`), остальное о поиске — в `ota_searches`, а отели
  каталога `ota-<master_id>` (маппер `src/lib/ota/hotel.ts`) — в `hotels` после сгенерированных. JSON в репозиторий
  не кладём. Печатает число строк; после загрузки — `npm run db:embed`.
- `npm run db:features [-- --dry-run]` — `scripts/hotel-features.ts`: свойства настоящих отелей для Эвала — здание и
  шум по `hotel_geo` в `hotel_features`, вид из номеров по названиям групп номеров `ota_hotels` в `hotel_room_views`.
  Сырые данные не копирует, повторный запуск ничего не меняет; `--dry-run` только считает. Затем — `npm run db:embed`.
- `npm run db:osm-places [-- --file <answer.json>] [-- --dry-run]` — `scripts/load-osm-places.ts`: места OpenStreetMap
  Валенсии для гео-инструментов Эвала (`src/lib/geo`) — медицина, бары и клубы, еда, супермаркеты, транспорт, пляжи и
  берег, парки, достопримечательности, центр — в `osm_places` и прямоугольник загрузки в `osm_place_areas`. Без
  `--file` спрашивает overpass-api.de; когда он перегружен — `uv run scripts/osm-pbf-to-overpass.py
<valencia-latest.osm.pbf> <answer.json>` из выгрузки Geofabrik и `--file`. Выгрузку и JSON в репозиторий не кладём и
  удаляем после загрузки. Upsert: повторный запуск обновляет те же строки, ничего не удаляет.
- `npm run db:embed` — `scripts/embed.ts`: векторы для поиска по смыслу (см. «Поиск по смыслу») по каталогу из базы —
  все отели. В модель уходят только новые и изменённые отели (`content_hash`),
  векторы удалённых объектов стираются; пачки по 32, при 429 и 5xx — повтор с паузой 2, 4, 8… с. Печатает: всего, посчитано,
  без изменений, ошибок, удалено. Запускать после `db:seed`; нужен `NVIDIA_API_KEY`, не больше 40 запросов в минуту (лимит ключа), при 429 — ожидание
  (`Retry-After` или 2, 4, 8… с) и повтор.
  Модель входит в `content_hash`: после смены модели (`EMBEDDING_MODEL`) первый `npm run db:embed` пересчитывает
  векторы всех отелей (миграция не нужна; число отелей ÷ 32 запросов, не больше 40 в минуту), повторный — ничего не шлёт
  в модель. Пока переиндексация не прошла, поиск по смыслу сравнивает вектор запроса со старыми векторами другой
  модели — запускать её сразу после выкладки.
- `npm run db:clean:shared-photos [-- --delete]` — `scripts/clean-shared-photos.ts`: фото снимков «Поделиться» в
  публичном bucket без снимка (удалён вместе с аккаунтом или вручную); без `--delete` только показывает папки и число
  файлов. Папки моложе часа не трогает. Нужен `SUPABASE_SERVICE_ROLE_KEY`.

## Производительность глобуса

Глобус — точечный wireframe на Canvas 2D, без WebGL и текстур: ~7 700 точек суши, контуры
побережий и сетка широт и долгот по всей сфере (`public/data/globe.json`, 53 KB в gzip). Кадр —
поворот единичных векторов без тригонометрии на точку и три заливки точек плюс два штриха линий.
Рисуется в полном разрешении экрана (`devicePixelRatio`), без понижения на слабых устройствах.
Глобус крутится перетаскиванием в обе стороны: по горизонтали — с инерцией, по вертикали меняется
наклон оси, и вращение продолжается с ним. Вокруг Земли медленно летают белые самолётики и ещё
медленнее — воздушные шары, по случайным большим кругам; скрывшись за горизонтом, каждый берёт
новый случайный курс (`globeFlyers.ts`). Из-за них
глобус перерисовывается каждый кадр, кроме режима «уменьшить движение», на экранах 120 Гц кадры
идут с частотой 60 fps.

## Режимы поиска

Панель поиска переключается между двумя режимами; рядом — два необычных поиска:

- **Ассистент** — свободный запрос («хочу на море в октябре, бюджет до 70 000 ₽»). Ассистент
  разбирает его, по одному задаёт недостающие вопросы (настроение, когда, с кем), сам выбирает
  атмосферу поездки и предлагает три варианта; выбранный открывает страницу результатов `/search`
  с его городом, датами и гостями (`src/lib/assistant.ts`). Сообщение читает языковая модель через `POST /api/assistant`
  (Vercel AI SDK, `src/lib/ai/`; см. «Модели»).
  Без `NVIDIA_API_KEY`, при ошибке, лимите (20 запросов в минуту с IP) или через 9 с — прежние правила по ключевым
  словам, без сообщения об ошибке. Сообщение — до 500 символов, история — до 20 сообщений. Когда все вопросы заданы,
  отели плана подбирает поиск по смыслу по всем словам путешественника в городах плана («тихий хостел с быстрым
  Wi‑Fi в Праге» — хостелы Праги); ответ с ним — до 15 с, клиент ждёт 16.
- **Вручную** — стандартная форма: направление, даты, гости; «Найти отель» открывает `/search`.
- **Звёзды подскажут** — имя и знак зодиака, затем детерминированное предсказание по западной
  астрологии: знак, Солнце и Луна в день заезда, фаза Луны и города каталога
  (`src/lib/horoscope.ts`). Результат — отель и город; из предсказания можно собрать видео для
  друзей и отправить его или скачать (`src/lib/shareMedia.ts`).
- **Поиск вайба** — семь пар противоположностей («Море / Город», «Уютный вечер / Шумная вечеринка»…),
  у каждой можно ответить «Не могу выбрать». По ответам считается архетип путешественника и
  подбираются отели, по одному на город (`src/lib/vibe.ts`): сначала поиск по смыслу по выбранным полюсам, остальное —
  расчёт по осям (он же — запасной путь); результат — картинка, которой можно поделиться.

### Поиск по смыслу

`src/lib/ai/semantic.ts` (только сервер): `semanticSearch(текст, { destinationIds, k, timeoutMs })` — вектор запроса
`nvidia/nemotron-3.5-embed-1b` (`input_type: query`), ближайшие объекты в Supabase pgvector
(`match_embeddings`, косинус, индекс HNSW), затем реранжирование `nvidia/nemotron-3.5-rerank-8b` (адаптер
`RerankingModelV4` в `src/lib/ai/rerank.ts`). Модель отдаёт 2048 чисел (HNSW индексирует не больше 4000), они хранятся как `halfvec(2048)`;
если вектор длиннее, берутся первые 2048 и нормируются заново. Без ключа, без векторов, при ошибке или через 8 с — `failed` с причиной (`no-key`, `timeout`, `aborted`, `model`,
`database`), и вызывающий код берёт прежние правила; упал только реранкер — порядок векторов. Поиск по смыслу в плане
(`searchStep`, `src/lib/ai/turn.ts`) повторяется один раз при `timeout`, `model` или `database`, если до срока ответа
(15 с) хватает времени; если и повтор не удался, ответ помечается `modelsDown`. Векторы недавних запросов кешируются в памяти процесса.
Таблица `embeddings` закрыта: читают её только функции `security definer`, пишет сервисный ключ.
Качество — `node --env-file=.env.local scripts/semantic-eval.ts` (15 запросов, попадания в top-5 до и после
реранжирования; вне CI).

### Модели

Все модели — через API NVIDIA (build.nvidia.com) с одним ключом `NVIDIA_API_KEY` (см. «Ключи API»); лимит ключа —
40 запросов в минуту, дневного лимита нет. Общий запрос и ошибки — `src/lib/ai/nvidia.ts`.

- **Текстовые задачи** (помощник, `src/lib/ai/model.ts`, `understand.ts`) — цепочка `nvidia/nemotron-3.5-lightning-30b-a3b`
  → `nvidia/nemotron-3.5-bolt-e4b` → `minimaxai/minimax-m3.1-flash`: следующая модель отвечает, если предыдущая
  не уложилась в свой срок или ошиблась. Все — через OpenAI-совместимый `https://integrate.api.nvidia.com/v1` (`@ai-sdk/openai-compatible`). Рассуждения
  выключены (`reasoning: 'none'` → `reasoning_effort: none`): иначе модель тратит на них время и токены ответа.
- **Эмбеддинги** — `nvidia/nemotron-3.5-embed-1b` (`/v1/embeddings`, `input_type` query/passage, `truncate: END`).
  Свой адаптер в `src/lib/ai/embedding.ts`: провайдер AI SDK не передаёт `input_type`.
- **Реранк** — `nvidia/nemotron-3.5-rerank-8b`
  (`https://ai.api.nvidia.com/v1/retrieval/nvidia/nemotron-3.5-rerank-8b/reranking`), оценка — логит модели.
- **Фото** (`src/lib/ai/vision.ts`) — цепочка `nvidia/nemotron-3.5-super-vl-120b-a12b` →
  `minimaxai/minimax-m3.1-flash`.

Скрипты (`db:embed`, `semantic-eval`) выдерживают 40 запросов в минуту и при 429 ждут (`Retry-After` или 2, 4,
8… с) и повторяют; приложение при ошибке, лимите или таймауте уходит в запасной путь по правилам.

## Стили

Tailwind CSS v4 (через `@tailwindcss/postcss`, `postcss.config.mjs`) и shadcn/ui, своих CSS-модулей нет.
Примитивы интерфейса — компоненты shadcn/ui на Base UI в `src/components/ui/` (настройки CLI —
`components.json`, добавить компонент: `npx shadcn@latest add <имя>`); там же лежат свои
примитивы вроде `SmartImage`. Все компоненты — раскладка страницы (`HomePage`), шапка, hero с
глобусом, карточки направлений, баннер, панель поиска, форма и поля, ассистент, окна «Звёзды подскажут» и вайба и страница результатов с маркерами карты —
написаны утилитами Tailwind. Значения, которые меняются по элементам или кадрам (координаты пинов
`--x`/`--y`, размеры сцены `--globe-*`), — CSS-переменные в `style` или в произвольных свойствах
(`[--globe-x:88%]`), их читают утилиты: `translate-x-[calc(var(--x)_*_var(--unit)_-_50%)]`.

Анимации компонентов объявлены в `@theme` в `src/app/globals.css`: переменная
`--animate-<имя>` и `@keyframes <имя>` внутри `@theme`, запуск — классом `animate-<имя>`
(`animate-slot-shine`, `animate-typing-dot`, `before:animate-hub-pulse`). Задержка, своя у
каждого элемента, — `animation-delay` в `style`. Появление элементов — утилиты `tw-animate-css`
(`animate-in`, `fade-in`, `zoom-in-*`, `slide-in-from-*`).

`translate`, `scale`, `rotate`, `box-shadow`: стандартные утилиты Tailwind (`-translate-x-1/2`,
`hover:-translate-y-[3px]`, `scale-105`, `rotate-10`, `shadow-[…]`, `shadow-(--shadow-card)`,
`inset-shadow-[…]`); произвольное свойство (`[transform:…]`) — только когда утилиты нет. Если
`@keyframes` двигают элемент, они меняют то же свойство, что задаёт утилита (`translate`, `scale`),
а не `transform`. Тень, которую анимация `box-shadow` должна плавно продолжить, ставится тем
слоем Tailwind, на месте которого она в `@keyframes` (`inset-shadow-*` для внутренней обводки).
Наведение — всегда `hover:` (Tailwind применяет его только на устройствах с наведением, касание
состояние не показывает); `[&:hover]` не использовать. `transition` — стандартными утилитами
(`transition-[scale,box-shadow] duration-250 ease-[ease]`; у нескольких свойств — списки значений:
`duration-[600ms,700ms]`), не `[transition:…]`. Значение, которое задаёт сдвиг или поворот по
состоянию, — CSS-переменная в `style`, читает её утилита (`translate-y-(--shift)`), а не
`transform` в `style`. Раскрытие аккордеона `ui/accordion` — анимации `animate-accordion-down`/`-up`
из `@theme` (высоту даёт `--accordion-panel-height` Base UI), при `prefers-reduced-motion` их нет.
Примитивы `src/components/ui/*` генерирует CLI shadcn, правило к ним не применяется.

Все токены описаны в `src/app/globals.css` слоями:

1. **Бренд** — `--brand-*`, сырые значения палитры. На них ссылается только `globals.css`.
2. **Роли** — `--background`, `--foreground`, `--primary`, `--primary-hover`, `--secondary`,
   `--muted`, `--muted-foreground`, `--border`, `--ring`, `--destructive`, `--brand` (лайм),
   `--success` и другие. Их читают Tailwind-классы и произвольные значения: `var(--primary)`.
   Прозрачные варианты строятся через `color-mix(in srgb, var(--роль) 12%, transparent)`.
3. **Тени и декор** — `--shadow-soft`, `--shadow-card`, `--shadow-popover`, `--shadow-color` и
   `--decor-*` для иллюстраций, стекла и окон поиска. Литералы цветов вне
   `globals.css` не пишутся (кроме `themeColor` в `layout.tsx` и canvas глобуса).
4. **Тема Tailwind** — `@theme` / `@theme inline` превращает роли в классы `bg-primary`,
   `text-muted-foreground`, `border-border`. `@theme` без `static`: в сборку попадают только
   токены, которые используют утилиты или `var()` в CSS.

Примитивы в `src/components/ui/`:

- **Button** (`button.tsx`): варианты `default` (синяя, при наведении `--primary-hover`),
  `secondary` (мягкий синий), `ghost`, `outline`, `link`; размеры `sm`, `default`, `lg`, `icon`,
  `icon-sm`; `shape="pill"` для круглых концов. У `default` + `lg` своя тень. Недоступная кнопка
  приглушена (`opacity: .5`) и не реагирует на наведение.
- **Badge** (`badge.tsx`): `secondary`, `destructive`, `success`.
- **Input**, **Textarea**, **Label**, **Card**, **Field** (`FieldError` и др.) — шаблоны shadcn на
  токенах бренда; `Card` без обводки.
- **SmartImage** — своя картинка с заглушкой при ошибке загрузки.
- **PhotoPlaceholder** — заглушка фото отеля или номера из каталога (градиент, иконка, подпись).

Фокус у всех элементов — одно кольцо `:focus-visible` на `--ring` из `globals.css`.

## Визуальная проверка

`scripts/screenshots.mjs` снимает страницы в двух viewport (390×844 и 1280×800, полная высота) в
headless Chromium (`playwright-core`, браузер из `~/.cache/ms-playwright`; при отсутствии —
`npx playwright-core install chromium`) и сравнивает кадры с прошлым прогоном через `pixelmatch`
(threshold 0.1). Изображения в репозиторий не попадают: по умолчанию вывод в
`/tmp/ostrovok-screenshots/<label>/`.

```bash
npm run build && npx next start -p 3341 &
node scripts/screenshots.mjs --label before --mask canvas / /search?destination=prague
# … правки, пересборка …
node scripts/screenshots.mjs --label after --against before --mask canvas / /search?destination=prague
```

Параметры: `--base` (по умолчанию `http://localhost:3341`), `--name` и `--out` (каталог вывода),
`--label`, `--against` (с чем сравнивать), `--wait` (мс после загрузки, 1000), `--mask <selector>`
(закрасить анимируемые элементы; глобус на `/` — `canvas`). Для расхождений рядом с кадром
сохраняется `*.diff.png`; код выхода 1, если кадры различаются.

`npx next start` порождает дочерний процесс `next-server`, который держит порт: чтобы остановить
сервер, завершите PID именно `next-server` (например, `lsof -ti :3341`), а не только родительского
`npx`.

## Демо-режим

Поиск работает без бэкенда: валидирует форму и открывает страницу результатов с параметрами запроса
(`/search?destination=…&checkin=…&checkout=…&adults=…&rooms=…`, для сценария — `scenario=…`);
отели и цены берутся из каталога в Supabase.
Страницы прототипа (поиск, отель, оформление, вход, поездки) строятся на основе ниже.

### Маршруты

Шапка (`src/components/Header`) и подвал (`src/components/Footer`) рендерятся в
`src/app/layout.tsx` на каждой странице; страница сама рендерит свой `main`. Сейчас есть `/`,
`/search` (результаты поиска), `/hotels/<id>`, `/hotels/<id>/rooms`, `/booking`, `/booking/confirmation`, `/login`, `/register`, `/trips`, `/trips/booking`, `/favorites`, `/help`, `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/auth/callback` (обработчик ссылки из письма) и страница 404 (`src/app/not-found.tsx`). Шапка и подвал ссылаются на разделы. Все страницы пререндерятся статически и перестраиваются в фоне раз в час (каталог, см. «Supabase»).

### Каталог

`src/lib/catalog.ts` — типы, подписи и помощники каталога; `src/lib/catalogGenerator.ts` — генератор
демо-каталога, который `npm run db:seed` загружает в Supabase: у каждого направления не меньше 6 отелей — отобранные
вручную из `src/data/hotels.ts` (их показывает глобус, `isNew`) плюс сгенерированные. Номера,
тарифы (питание, отмена, оплата, цена за ночь), отзывы, адрес и координаты генерируются
детерминированно (PRNG с seed по id отеля): каталог одинаков при каждом запуске. `hotels`/`newHotels` — краткие карточки, `getHotel(id)` строит полный отель при первом
запросе. Минимальная цена направления (`priceFrom`) равна минимальному тарифу его отелей. Фото
нет: `PhotoPlaceholder` рисует градиент из палитры, иконку и подпись.

`src/lib/offer.ts` — выбранное предложение в адресе: `hotel`, `room`, `rate` и параметры
дат и гостей поиска (`checkin`, `checkout`, `adults`, `children`, `rooms`). `parseOffer`
возвращает предложение с ценой (за ночь × ночи × номера) или ошибку («Предложение не найдено»
либо сообщение проверки дат и гостей).

### Страница результатов

`/search` (`src/app/search/page.tsx`, `src/components/SearchResultsPage`) пререндерится без
запроса и читает его из адреса в браузере (`useSearchParams` внутри `Suspense`). Невалидный
запрос показывает форму поиска с ошибками; валидный — демо-поиск (~700 мс, «Ищем варианты…»),
сводку с кнопкой «Изменить поиск» и карточки отелей города или всех городов сценария. Карточка
ведёт на `/hotels/<id>` с датами и гостями запроса. Фильтры и сортировка (`src/lib/results.ts`)
хранятся в адресе и заменяют его без новой записи истории: `price_min`, `price_max` (цена за
ночь), `stars` (через запятую), `rating` (6–9), `meal` (через запятую), `free_cancel=1`, `sort`
(`price_asc`, `price_desc`, `rating`; по умолчанию — популярные, по числу отзывов). Отель
показывается с самым дешёвым тарифом среди подходящих под фильтры питания и отмены; фильтр и
сортировка по цене используют его.

Карта — MapLibre GL (`maplibre-gl`) с векторными тайлами OpenFreeMap (стиль `liberty`, без
ключа; атрибуция OpenStreetMap — из стиля). Модуль карты подключается динамическим импортом
только на `/search` и только в браузере; путь к воркеру MapLibre задан явно
(`setWorkerUrl`), потому что сборщик переносит его модуль. Маркеры — цены за ночь; наведение
или фокус на карточке подсвечивает маркер, нажатие на маркер подсвечивает карточку и
прокручивает к ней. От `lg` список и карта стоят рядом, на узких экранах — переключатель
«Список / Карта» (карта загружается только при выборе). Если стиль не загрузился (нет сети) или
нет WebGL, вместо карты — «Карта недоступна», список и фильтры работают. В тестах `maplibre-gl`
подменяется моком.

Turbopack превращает `new URL(x, import.meta.url)` в `maplibre-gl.mjs` в ассеты всех файлов
`maplibre-gl/dist` (~5 МБ), поэтому `next.config.ts` пропускает этот файл через loader
`config/maplibre-no-asset-glob.cjs`, заменяющий `import.meta.url`. При обновлении MapLibre запустите
`npm test`: тест `src/lib/maplibreLoader.test.ts` падает, если в новой версии такого шаблона уже нет
(loader не нужен — удалите его и правило в `next.config.ts`) или после замены остался `import.meta.url`
(поправьте loader). Затем проверьте `npm run build` и карту на `/search`.

### Страница отеля и выбор тарифа

`/hotels/<id>` (`src/components/HotelPage`) — большое фото под прозрачной шапкой с рядом
миниатюр (`Gallery`: свайп на `scroll-snap`, полноэкранный просмотр на диалоге shadcn, ←/→,
Escape, фокус возвращается на фото), название с избранным, звёзды, адрес, блок оценки (плашка и
полосы 8 разделов на одной цветовой шкале `scoreColor` из `src/lib/reviews.ts`), «Об отеле» со
расстояниями в км (`travelDistances`) и 6 популярными удобствами, номера с минимальной ценой.
«Показать на карте», «Читать отзывы (N)» и «Все удобства» — кнопки одного вида (`DialogButton`),
каждая открывает окно: карту отелей города, отзывы по 5 с «Показать ещё», удобства по разделам
(`AMENITIES` в `src/lib/catalog.ts`). `/hotels/<id>/rooms` (`src/components/RatesPage`) — все тарифы номеров:
питание, условия отмены и оплаты, цена за срок и за ночь; номер, где гостей на номер больше
вместимости, недоступен; «Забронировать» ведёт на `/booking?…` с параметрами предложения.
Оба маршрута пререндерятся по `generateStaticParams` для каждого отеля базы, новый отель базы рендерится при первом
запросе, неизвестный `id` — 404. Даты и гости (`checkin`, `checkout`, `adults`, `children`, `rooms`) читает `useStay`
(`src/components/StayBar`) из адреса на клиенте; изменение заменяет адрес без новой записи
истории. Без дат (или с неверными) цены показаны за ночь, а вместо «Выбрать» и «Забронировать» —
«Выберите даты». Тариф, у которого дата бесплатной отмены уже прошла, показан невозвратным
(`src/lib/rates.ts`).

### Оформление и подтверждение

`/booking` (`src/components/BookingPage`) читает предложение из адреса (`parseOffer`) на клиенте внутри
`Suspense`; неверное — «Предложение не найдено» со ссылкой «Найти отель». Сводка заказа и форма:
основной гость каждого номера, email и телефон, пожелания (до 500 символов), оплата и согласие с
условиями. Войдя в демо-сессию, пользователь видит имя и email из неё. Для тарифа «Оплата сейчас»
форма карты (номер по Luhn, срок `MM/YY` не в прошлом, CVC, держатель; тестовая карта
`4242 4242 4242 4242`), для «Оплаты в отеле» — только пометка. Над оплатой — пометка о демо. Ошибки
показываются у полей, фокус переходит на первое невалидное. Валидная форма — «Обрабатываем…» ~1 с,
затем бронирование `OS-XXXXXX` со статусом `confirmed` попадает в `bookingsStore` (только последние
4 цифры карты) и адрес заменяется на `/booking/confirmation?id=<номер>` (`router.replace`, «Назад»
не возвращает к форме). Подтверждение (`src/components/BookingConfirmation`) читает бронирование
из хранилища; неизвестный номер — «Бронирование не найдено» со ссылкой «Мои поездки».

Проверки формы — в `src/lib/booking.ts` (`validateTravelerDetails` — гости, контакты, пожелания;
`validateCard`; `createBooking`). Поля — переиспользуемые компоненты `src/components/BookingFields`
(`GuestsFields`, `ContactFields`, `RequestsField`, `CardFields` на `TextField`): они получают значения,
`onChange` и ошибки по id поля, форму и состояние держит страница.

### Вход и регистрация

Вход — Supabase Auth по одноразовой ссылке (`signInWithOtp` из браузерного клиента
`src/lib/supabase/client.ts`): «Вход» просит email, «Регистрация» — имя, email и согласие с условиями (имя уходит в
`options.data` и триггером попадает в `profiles`). Паролей в формах нет. После отправки форма показывает «Проверьте
почту»; ошибки проверки — у полей, ошибки отправки — над кнопкой. Ссылка из письма ведёт на `/auth/callback`
(`src/app/auth/callback/route.ts`): обмен `code` на сессию (или `token_hash`) и переход на `next`, иначе `/login`
с «Ссылка устарела…». В настройках Auth проекта Supabase адрес `<сайт>/auth/callback` должен быть в Redirect URLs.

«Войти в демо-аккаунт» — серверное действие `signInDemo` (`src/app/auth/actions.ts`, `signInWithPassword` с
`DEMO_USER_EMAIL` и `DEMO_USER_PASSWORD` через `getSecret`); аккаунт создаёт `npm run db:seed`. Сессия живёт в cookie
Supabase; `src/proxy.ts` обновляет её на запросах с этой cookie. Интерфейс читает её через `sessionStore`
(`src/lib/session.ts`, `onAuthStateChange`, имя — из `profiles`, затем из данных регистрации, затем часть email до
`@`). «Выйти» (`signOut`, `scope: 'local'` — демо-аккаунт общий) завершает сессию только в этом браузере: избранное и
бронирования остаются. Без `NEXT_PUBLIC_SUPABASE_*` вход сообщает «Вход временно недоступен».

`/login` и `/register` — полные страницы (`AuthPage`). Переход на них из приложения (ссылка «Войти» в
шапке) перехватывается: параллельный маршрут `@modal` с `(.)login` и `(.)register` показывает ту же форму диалогом
(`AuthDialog`) поверх текущей страницы; кнопка, Escape и клик по подложке делают `router.back()`.
Переключатель «Вход / Регистрация» — `router.replace`, диалог остаётся перехваченным. Параметр `next`
задаёт страницу после входа (`resolveNext`): только путь с `/`, но не `//`, не с `\` и
управляющими символами, иначе `/`. Без `next` диалог закрывается, полная страница ведёт на `/`.

В шапке гость видит «Войти» (так же до гидрации), вошедший — кнопку с именем и меню «Мои поездки»,
«Избранное», «Выйти» (`src/components/Header/UserMenu.tsx`).

### Мои поездки и избранное

`/trips` (`src/components/Trips`) требует демо-сессию: гость видит «Войдите, чтобы увидеть поездки» и
ссылку `/login?next=…` на текущий путь (`TripsGate`). Бронирования не привязаны к пользователю:
показываются все, что сделаны в этом браузере. Вкладки (`tripsIn` в `src/lib/trips.ts`):
«Предстоящие» — подтверждённые с выездом не раньше сегодня (по заезду по возрастанию), «Завершённые» —
подтверждённые с выездом в прошлом, «Отменённые»; последние две — по заезду по убыванию.

`/trips/booking?id=<номер>` показывает заказ целиком и, для предстоящего, «Изменить данные» (гости,
контакты, пожелания — поля и проверки оформления, «Изменения сохранены») и «Отменить бронирование».
Диалог отмены показывает «Бесплатно» до последнего дня бесплатной отмены, затем «Удержание: N ₽» —
стоимость первой ночи, для невозвратного тарифа вся сумма (`cancellationFee`); подтверждение
сохраняет статус `cancelled`, дату и сумму удержания. Даты изменить нельзя — ссылка на `/help`.
Неизвестный номер — «Бронирование не найдено».

`/favorites` (`src/components/Favorites`) работает без входа: карточки сохранённых отелей со ссылкой
на `/hotels/<id>` и кнопкой `FavoriteButton`; пусто — «В избранном пока пусто» и ссылка на `/`.

### Поддержка и юридические страницы

`/help` (`src/components/HelpPage`): вопросы из `src/data/faq.ts` (20 вопросов, 4 категории) в
аккордеоне shadcn (`ui/accordion`). Поиск (`filterFaq` в `src/lib/faq.ts`) ищет по вопросу и
ответу без учёта регистра и «ё/е»; без совпадений — «Ничего не нашлось» и ссылка на форму.
`/help#<id вопроса>` раскрывает вопрос и прокручивает к нему. Форма обращения (имя, email,
сообщение; номер бронирования необязателен) только проверяет поля и показывает «Обращение
отправлено (демо)»: данные не отправляются и не сохраняются.

`/legal/terms`, `/legal/privacy`, `/legal/cookies`: тексты-шаблоны лежат в `src/data/legal.ts`,
разметку даёт общий `src/components/LegalPage` (дата обновления, демо-пометка, оглавление по
`h2` с якорями). Страница cookie перечисляет cookie сессии Supabase и ключи `ostrovok:v1:*`. Все страницы статические.

### Состояние в браузере

`src/lib/storage.ts` хранит избранное и бронирования в `localStorage`
(`ostrovok:v1:favorites`, `ostrovok:v1:bookings`), сессия — Supabase (`src/lib/session.ts`); хуки — в
`src/hooks/useStore.ts` (`useSyncExternalStore`, без библиотек состояния). При пререндере и
гидрации значения пустые, изменения видны в других вкладках, повреждённые данные читаются как
пустые. Платёжные данные не сохраняются: у бронирования только последние 4 цифры карты.
Кнопка `FavoriteButton` переключает отель в избранном.

## Изображения

Готовые файлы лежат в `public/images` (источники и лицензии — `public/images/CREDITS.md`):

```bash
uv run --with pillow python scripts/build-images.py <папка-с-исходниками>
```

Геометрия глобуса собирается из Natural Earth 1:50m (`ne_50m_land.geojson`,
`ne_50m_coastline.geojson`): точки, береговые линии и кольца суши для зелёной заливки:

```bash
uv run --with pillow --with numpy python scripts/build-globe.py <папка-с-geojson>
```
