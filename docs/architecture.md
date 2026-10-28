# Архитектура интерфейса

Стили, глобус, состояние в браузере и изображения. Инструменты Эвала — в [tools.md](tools.md).

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

## Состояние в браузере

`src/lib/storage.ts` хранит избранное и бронирования в `localStorage`
(`ostrovok:v1:favorites`, `ostrovok:v1:bookings`), сессия — Supabase (`src/lib/session.ts`); хуки — в
`src/hooks/useStore.ts` (`useSyncExternalStore`, без библиотек состояния). При пререндере и
гидрации значения пустые, изменения видны в других вкладках, повреждённые данные читаются как
пустые. Платёжные данные не сохраняются: у бронирования только последние 4 цифры карты.
Кнопка `FavoriteButton` переключает отель в избранном.

## Изображения

Готовые файлы лежат в `public/images` (источники и лицензии — `public/images/CREDITS.md`):

```bash
uv run --with pillow python scripts/build-images.py <папка-с-исходниками>   # фото «Поиска вайба», небо «Звёзд»
node scripts/build-star-assets.mjs <папка с orb.png, modal-bg.jpeg, button.jpeg>   # шар, окно и кнопка «Звёзд»
node scripts/build-draw-images.mjs <папка с section-bg.png, canvas-drawing.png, result-image.png>   # «Нарисуй»
```

Геометрия глобуса собирается из Natural Earth 1:50m (`ne_50m_land.geojson`,
`ne_50m_coastline.geojson`): точки, береговые линии и кольца суши для зелёной заливки:

```bash
uv run --with pillow --with numpy python scripts/build-globe.py <папка-с-geojson>
```
