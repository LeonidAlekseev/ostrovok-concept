# Proposal

## Why

После `reduce-custom-css`, `reduce-page-css` и `reduce-hero-css` у компонентов поиска остались CSS-модули: `SearchForm.module.css` (44 строки, его используют `SearchForm`, `DestinationField`, `DateField`, `GuestsField`), `SearchPanel.module.css` (40), `RandomSearch.module.css` (133), `AssistantSearch.module.css` (29). Пока модули читают токены темы во время выполнения, `@theme` в `src/app/globals.css:137` должен оставаться `static`, и в сборку попадают неиспользуемые токены.

Кроме того, для `translate`, `scale` и `box-shadow` в коде смешаны два подхода: стандартные утилиты Tailwind (тянут `@property` и fallback-блоки) и arbitrary properties (`[translate:…]`, `[box-shadow:…]`). Единого правила нет (находка `reduce-page-css`).

## What Changes

- Перевести стили четырёх модулей на Tailwind-утилиты и классы примитивов `src/components/ui/*`. Модуль оставить только для того, что Tailwind не выражает (например, `@keyframes` слот-машины). Пустой модуль удалить.
- Зафиксировать политику: стандартная утилита, если она не добавляет в сборку новых `@property` и fallback-блоков; иначе arbitrary property. Политику записать в README, раздел «Стили», и применять в этом change.
- Визуальная проверка — скриншоты до и после по методике `reduce-page-css`.
- Размер CSS записывается для информации. Первоначальный критерий (gzip растёт не больше чем на 2 %) отменён решением пользователя 2026-10-19.

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

Итог (`npm run build`): суммарный размер CSS — **97 752 байт** (gzip −9: 19 202 байт), то есть +4 856 байт (+5,2 %) к сырому и +459 байт (+2,4 %) к gzip. Чанки: `2ehucfnjrk34z.css` — 87 441 байт, `2sgr-0ah-c611.css` — 10 311 байт. По шагам gzip: `SearchForm` 18 714, `SearchPanel` 18 987, `AssistantSearch` 18 967, `RandomSearch` 19 308, политика `translate`/`scale`/`shadow` 19 202.

Решение пользователя 2026-10-19: от своего CSS в пользу Tailwind и shadcn отказываемся во всех модулях; критерий «gzip не больше +2 %» отменён, рост размера не блокирует, замеры остаются для информации. Остатки модулей (`@keyframes` и классы запуска в `RandomSearch.module.css`, `.dot` в `AssistantSearch.module.css`) оставлены: перенос анимаций в `@theme` (`--animate-*`) в `globals.css` выполнит `reduce-globe-css`.

Результат pixelmatch (threshold 0.1, 40 кадров, 1280×900 и 390×844): 0,000 % во всех кадрах, кроме шума базы (повторная съёмка «до» даёт те же значения) — `desktop-assistant-plan` 1,445 %, `desktop-random-slot-start` и `desktop-random-slot-landed` по 0,595 % — и кадра `assistant-thinking`, который гоняется с таймером ответа на 650 мс. Типинг ассистента снят отдельно с замороженным таймером (в покое и в середине анимации): 0,000 % на обоих viewport. Анимации слот-машины (блик кнопки, лампочки, рычаг) снимались на паузе с фиксированным временем и сравнивались со сборкой `0281018`: расхождения (0,10–0,47 %) лежат только в области глобуса Hero, в панели 0.
