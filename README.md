# ostrovok-concept

Островок! - концепт агрегатора в сфере онлайн-бронирования жилья

Главная страница сервиса бронирования отелей (Next.js 16 App Router + React 19 + TypeScript).
Визуальный референс — `references/homepage.jpg`.

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

CI (GitHub Actions, `.github/workflows/ci.yml`) на каждый PR и push в `dev` и `main` запускает
`npm ci`, `npm run lint`, `npm run typecheck`, `npm test` и `npm run format:check` в job `checks`
(проверка `CI / checks`). Сборку в CI не запускают: её выполняет Vercel.

## Деплой на Vercel

Vercel определяет проект как Next.js без дополнительной настройки:
импортируйте репозиторий (Framework Preset — Next.js, команды по умолчанию)
или выполните `npx vercel --prod` из корня. Нужен Node.js ≥ 20.9.
Переменные окружения не требуются.

Вне production (`npm run dev` и preview-деплои Vercel, по `VERCEL_ENV`) в левом нижнем углу
показываются технические параметры глобуса: fps, время кадра, разрешение рендера,
объём геометрии. Проверить production-сборку с ними локально: `VERCEL_ENV=preview npm run build`.

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

Панель поиска переключается между тремя режимами:

- **Ассистент** — свободный запрос («хочу на море в октябре, бюджет до 70 000 ₽»). Ассистент
  разбирает его, по одному задаёт недостающие вопросы (настроение, когда, с кем), сам выбирает
  атмосферу поездки и предлагает три варианта; выбранный открывается в ручном поиске
  (`src/lib/assistant.ts`). Это локальные правила по ключевым словам, без языковой модели.
- **Вручную** — стандартная форма: направление, даты, гости.
- **Случайность** — имя и знак зодиака, затем слот-машина выбирает один из лучших новых отелей
  (рейтинг от 9,0), глобус поворачивается к городу, результат можно отправить в соцсети
  (`src/lib/fortune.ts`).

## Стили

Tailwind CSS v4 (через `@tailwindcss/postcss`, `postcss.config.mjs`) и shadcn/ui, своих CSS-модулей нет.
Примитивы интерфейса — компоненты shadcn/ui на Base UI в `src/components/ui/` (настройки CLI —
`components.json`, добавить компонент: `npx shadcn@latest add <имя>`); там же лежат свои
примитивы вроде `SmartImage`. Все компоненты — раскладка страницы (`HomePage`), шапка, hero с
глобусом, карточки направлений, баннер, панель поиска, форма и поля, ассистент и слот-машина —
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
Примитивы `src/components/ui/*` генерирует CLI shadcn, правило к ним не применяется.

Все токены описаны в `src/app/globals.css` слоями:

1. **Бренд** — `--brand-*`, сырые значения палитры. На них ссылается только `globals.css`.
2. **Роли** — `--background`, `--foreground`, `--primary`, `--primary-hover`, `--secondary`,
   `--muted`, `--muted-foreground`, `--border`, `--ring`, `--destructive`, `--brand` (лайм),
   `--success` и другие. Их читают Tailwind-классы и произвольные значения: `var(--primary)`.
   Прозрачные варианты строятся через `color-mix(in srgb, var(--роль) 12%, transparent)`.
3. **Тени и декор** — `--shadow-soft`, `--shadow-card`, `--shadow-popover`, `--shadow-color` и
   `--decor-*` для иллюстраций, стекла, слот-машины и конфетти. Литералы цветов вне
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

Фокус у всех элементов — одно кольцо `:focus-visible` на `--ring` из `globals.css`.

## Демо-режим

Бэкенда нет: поиск валидирует форму, формирует параметры запроса
(`?destination=…&checkin=…&checkout=…&adults=…&rooms=…`, они же пишутся в адресную строку)
и показывает ориентировочные цены из локального каталога `src/data/destinations.ts`.
Бронирование, вход в профиль и избранное не реализованы.

## Изображения

Готовые файлы лежат в `public/images` (источники и лицензии — `public/images/CREDITS.md`):

```bash
uv run --with pillow python scripts/build-images.py <папка-с-исходниками>
```

Геометрия глобуса собирается из Natural Earth 1:50m (`ne_50m_land.geojson`,
`ne_50m_coastline.geojson`):

```bash
uv run --with pillow --with numpy python scripts/build-globe.py <папка-с-geojson>
```
