# Design

## Context

`HomePage.tsx` помечен `'use client'`, поэтому всё его поддерево клиентское. Клиентскими по природе остаются виджеты с состоянием и событиями (поиск, даты, гости, вкладки на Base UI). Next 16 в этом проекте может отличаться от привычного: до оценки нужно прочитать `node_modules/next/dist/docs/` по серверным и клиентским компонентам, как требует `AGENTS.md`. См. proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Таблица: для каждого компонента страницы — причина быть клиентским, можно ли отдать серверно, оценка выигрыша.
- Замер размера клиентского JS главной до изменений.

**Non-Goals:**
- Реализация переноса.
- Изменение поведения страницы.

## Decisions

**Оценка без прототипа.** Сначала таблица и замер. Прототип пишется только если таблица покажет заметный выигрыш.

**Метрика — размер клиентских чанков главной**, снятый из вывода `npm run build`.

## Risks / Trade-offs

- [Граница client/server ломает гидрацию] → Оценка фиксирует границы; реализация проверяется в отдельном change.

## Migration Plan

Не применимо: изменений кода нет.

## Прочитанная документация (задача 1.1)

Next.js 16.4.1, `node_modules/next/dist/docs/01-app/`:

- `01-getting-started/05-server-and-client-components.md` — разделы «When to use Server and Client Components?», «How do Server and Client Components work in Next.js?», «Reducing JS bundle size», «Passing data from Server to Client Components», «Interleaving Server and Client Components», «Third-party components».
- `02-guides/server-and-client-boundary.md` — «Crossing the boundary»: код пересекает границу через импорты, данные — через сериализуемые пропсы; обработчики событий передать из серверного компонента нельзя; отрендеренный элемент можно передать слотом (`children`/проп).
- `03-api-reference/01-directives/use-client.md` — директива `'use client'` делает клиентским модуль и всё, что он импортирует.
- `03-api-reference/05-config/01-next-config-js/cacheComponents.md` и `04-glossary.md` (Partial Prerendering) — в Next 16 PPR включается флагом `cacheComponents`, `experimental.ppr` удалён.
- `03-api-reference/06-cli/next.md` — с 16.0 `next build` больше не печатает размеры JS; с 16.1 есть `next experimental-analyze`.

Ответ на открытый вопрос о PPR: не нужен. Главная собирается как полностью статическая (`○ /` в выводе `next build`), динамических данных нет. PPR разделяет статическую оболочку и динамические части — здесь разделять нечего.

## Инвентаризация дерева `HomePage.tsx` (задача 2.1)

Дерево снято через codebase-memory-mcp (`trace_path HomePage outbound`) и сверено с исходниками. `src/app/page.tsx` и `src/app/layout.tsx` уже серверные; граница проходит по `HomePage.tsx`.

| Компонент | Причина клиентности | Можно отдать серверно? |
|---|---|---|
| `HomePage` | `useState` (режим поиска), `useRef`, `useCallback`, `flushSync`, `useHotelSearch`, `document.getElementById`; держит общее состояние для `Header`, `Hero`, `SearchPanel` и карточек | Нет. Это корень общего состояния |
| `Header` | `useState`/`useCallback`, `onClick`, Base UI `Popover`, `Button` | Нет |
| `Hero` | `useState`, `useEffect`/`useLayoutEffect`, canvas, `requestAnimationFrame`, `window.matchMedia`, `scroll`-слушатель, `onClick` по пинам | Нет |
| `Hero/StatsPanel` | `useSyncExternalStore`, `localStorage`, портал в `document.body` | Нет |
| `Hero/globe*` (`globeRenderer`, `globeScene`, `globeFlyers`, `globeGeometry`, `globePerformance`) | Не компоненты: модули расчёта и отрисовки глобуса, нужны в браузере | Нет |
| `SearchPanel` | Base UI `Tabs` с управляемым значением, `onValueChange` | Нет |
| `SearchPanel/AssistantSearch` | `useState`, `useEffect`, таймеры, формы, Base UI `Textarea`/`Button`/`Badge` | Нет |
| `SearchPanel/RandomSearch` (+ `SlotMachine`, `Confetti`) | `useState`, `useEffect`, `useEffectEvent`, `requestAnimationFrame`, `window.location`, Base UI `RadioGroup`/`Input` | Нет |
| `SearchPanel/RobotAvatar` | `useId`; без состояния и событий | Да, но рендерится только внутри клиентского `AssistantSearch` — серверным не станет без переноса родителя |
| `SearchForm` | `useRef`, `onSubmit`, `onChange` | Нет |
| `SearchForm/DestinationField` | `useId`/`useMemo`/`useRef`, Base UI `Combobox` | Нет |
| `SearchForm/DateField` | `useState`/`useId`, Base UI `Popover` | Нет |
| `SearchForm/Calendar` | `useState`/`useEffect`, клавиатурная навигация, `window.matchMedia` | Нет |
| `SearchForm/GuestsField` | `useState`/`useId`, Base UI `Popover` | Нет |
| `SearchForm/SearchResults` | Зависит от результатов клиентского поиска | Нет |
| `DestinationCard` | `onClick` (подставляет сценарий в поиск), `aria-pressed` от клиентского состояния | Нет |
| `ui/SmartImage` | `useState` + `onError` (запасная картинка) | Нет |
| Заголовок секции «Популярные направления» (`h2` в `HomePage`) | Нет своей причины; соседняя кнопка «Смотреть все» — `onClick` | Да (только `h2`) |
| `TravelBanner` | Нет: статичная разметка, иконки `lucide-react`, CSS-модуль | **Да** |
| `ui/*` обёртки Base UI (`button`, `popover`, `tabs`, `combobox`, `radio-group`, `input`, `textarea`, `badge`, `field`, `label`, `card`) | Base UI держит состояние и события; используются только внутри клиентских виджетов | Нет в этом дереве |

Данные (`data/destinations.ts`, `data/hotels.ts`) остаются в клиентском бандле при любом раскладе: их читают клиентские `lib/search.ts`, `lib/assistant.ts`, `lib/fortune.ts` и глобус.

## Базовый замер (задача 2.2)

Метод: `npm run build` (Next 16.4.1, Turbopack; размеров в выводе нет), затем список `<script>` из `.next/server/app/index.html` и `gzip -9` каждого файла. Разбивка по модулям — `next experimental-analyze -o` (`.next/diagnostics/analyze/data/analyze.data`).

| Группа | Сырой размер | gzip |
|---|---|---|
| Чанк главной (код приложения + Base UI + lucide + `cn`) | 300 981 Б | 106 049 Б |
| Общие чанки Next/React (4 корневых + `layout-router`) | 455 990 Б | 134 810 Б |
| **Итого JS для современных браузеров** | **756 971 Б (~739 КБ)** | **240 859 Б (~235 КБ)** |
| Полифиллы (`noModule`, современные браузеры не грузят) | 112 594 Б | 39 392 Б |
| CSS | 91 511 Б | 18 883 Б |

Состав чанка главной (сырой размер по `experimental-analyze`): `@base-ui/react` + `@base-ui/utils` + `@floating-ui/*` ≈ 166 КБ; пакет `cn` ≈ 25,7 КБ; `lucide-react` ≈ 10 КБ; весь код `src/` ≈ 98 КБ (с картами CSS-модулей), из него `Hero.tsx` 9,1 КБ, `lib/assistant.ts` 7,6 КБ, `RandomSearch.tsx` 7,1 КБ, данные `hotels.ts` + `destinations.ts` 10,6 КБ.

## Оценка границ и выигрыша (задача 3.1)

Предлагаемая граница: `page.tsx` (сервер) рендерит `<TravelBanner />` и передаёт его в клиентский `HomePage` слотом-пропом (паттерн Interleaving). Заголовок `h2` можно вынести так же, но он внутри секции с клиентской кнопкой, поэтому выигрыш от него — десятки байт.

| Кандидат | Что уходит из клиентского JS | Оценка, сырой / gzip | Риски |
|---|---|---|---|
| `TravelBanner` слотом из `page.tsx` | `TravelBanner.tsx` 890 Б, карта CSS-модуля 219 Б, иконки `Compass` 229 Б и `Plane` 280 Б | ≈ 1,6 КБ / < 1 КБ | Новый проп у `HomePage` ради одной секции; порядок секций определяется в двух файлах |
| `h2` «Популярные направления» | Строка JSX | ≈ 0,1 КБ | Секцию придётся делить на серверную и клиентскую части; хуже читается |
| `RobotAvatar` | — | 0 | Родитель клиентский; без переноса `AssistantSearch` выигрыша нет |
| Остальные компоненты | — | 0 | Требуют состояния, событий, Base UI или браузерных API |
| **Итого** | | **≈ 1,7 КБ сырых / < 1 КБ gzip** — ≈ 0,6 % чанка главной, ≈ 0,2 % всего JS | |

Вывод: серверные компоненты на этой странице почти ничего не дают. HTML уже пререндерится статически, поэтому FCP не меняется. Выигрыш — только меньше JS на парсинг и гидрацию одного статичного баннера. Вес страницы сидит в интерактивных виджетах (Base UI ≈ 55 % чанка) и во фреймворке. Перенос границы их не трогает.

Наблюдения вне рамок этой оценки (не входят в change, решение не принято):

- Пакет `cn` весит ≈ 25,7 КБ сырых (`dist/engine.js` + `dist/tables.js`) — больше всего кода `Hero`. Стоит проверить отдельно.
- Вкладки «Ассистент», «Случайность», «Вручную» смонтированы сразу (`keepMounted`). Ленивая загрузка неактивных вкладок через `next/dynamic` дала бы больше, чем серверные компоненты, но меняет поведение (`keepMounted` сохраняет ввод).

## Решение (задача 3.2)

**Рекомендация: не создавать change на реализацию серверных компонентов.** Ожидаемый выигрыш ≈ 1,7 КБ сырых и меньше 1 КБ gzip (≈ 0,2 % JS страницы). Цена — новый слот-проп у `HomePage` и вёрстка, разнесённая по двум файлам. Прототип по правилу из раздела Decisions не пишется: таблица не показала заметного выигрыша.

**Решение за пользователем.** Вопрос вынесен ему: создавать ли change на реализацию, несмотря на малый выигрыш, или закрыть тему. Если цель — уменьшить JS главной, лучше отдельно оценить пакет `cn` и ленивую загрузку вкладок.

## Open Questions

- PPR: закрыт — не нужен, см. «Прочитанная документация».
- Создавать ли change на реализацию — за пользователем, см. «Решение».
