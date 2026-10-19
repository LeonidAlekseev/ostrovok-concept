# Proposal

## Why

После `reduce-custom-css`, `reduce-page-css` и `reduce-hero-css` у компонентов поиска остались CSS-модули: `SearchForm.module.css` (44 строки, его используют `SearchForm`, `DestinationField`, `DateField`, `GuestsField`), `SearchPanel.module.css` (40), `RandomSearch.module.css` (133), `AssistantSearch.module.css` (29). Пока модули читают токены темы во время выполнения, `@theme` в `src/app/globals.css:137` должен оставаться `static`, и в сборку попадают неиспользуемые токены.

Кроме того, для `translate`, `scale` и `box-shadow` в коде смешаны два подхода: стандартные утилиты Tailwind (тянут `@property` и fallback-блоки) и arbitrary properties (`[translate:…]`, `[box-shadow:…]`). Единого правила нет (находка `reduce-page-css`).

## What Changes

- Перевести стили четырёх модулей на Tailwind-утилиты и классы примитивов `src/components/ui/*`. Модуль оставить только для того, что Tailwind не выражает (например, `@keyframes` слот-машины). Пустой модуль удалить.
- Зафиксировать политику: стандартная утилита, если она не добавляет в сборку новых `@property` и fallback-блоков; иначе arbitrary property. Политику записать в README, раздел «Стили», и применять в этом change.
- Визуальная проверка — скриншоты до и после по методике `reduce-page-css`.
- Критерий размера (решение пользователя 2026-10-19): gzip CSS сборки растёт не больше чем на 2 % относительно замера до изменений; рост сырого размера допустим.

Поведение не меняется, delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/components/SearchForm/{SearchForm,DestinationField,DateField,GuestsField}.tsx`, `SearchForm.module.css`.
- `src/components/SearchPanel/{SearchPanel,RandomSearch,AssistantSearch}.tsx` и их модули.
- `README.md`, раздел «Стили».
- Не входят: `Hero`, `globals.css` (в т. ч. `static` у `@theme`) — это change `reduce-globe-css`.
- Источник: TODO, «Предложения», пункты 6–7.

## Замеры

До изменений (`npm run build` от `0281018`): суммарный размер CSS сборки — **92 896 байт** (gzip −9 склеенного файла: 18 743 байт). Предел по критерию (+2 %): 19 117 байт gzip. `.next/static/chunks/*.css`: `1ir1k8u9ozl-1.css` — 79 345 байт, `0eht2-yiorw1o.css` — 13 551 байт.

Скриншоты (вне репозитория, не коммитятся): 20 состояний × 2 viewport (1280×900 и 390×844) = 40 кадров. Обрезка от верха панели поиска вниз (глобус в Hero анимирован по времени и шумит, он вне scope). Повторная съёмка «до» совпадает с первой во всех кадрах, кроме `desktop-assistant-plan` (1,445 %), `desktop-random-slot-start` и `desktop-random-slot-landed` (по 0,595 %) — это шум базы.
