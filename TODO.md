# TODO

Единый реестр задач. Редактирует только оркестратор. Задачи берутся в работу через OpenSpec change;
выполненные и неактуальные не удаляются, а переносятся в архивные разделы со ссылкой на PR.

## В работе

Этап 1 — не более двух исполнителей одновременно, очередь: `add-ci-checks` и `reduce-hero-css`,
затем `fix-search-dates-effect`, затем `reduce-page-css`.

- [ ] **CI в GitHub Actions.** lint, typecheck, тесты и `format:check` на каждый PR в `dev` и `main`.
      — change `add-ci-checks` — статус: в работе — ветка `add-ci-checks` — PR: —.
- [ ] **Сократить кастомный CSS `Hero`.** `Hero.module.css` (544 строки): перенести раскладку, текст,
      карточку места и статистику на Tailwind; эффекты глобуса и пинов оставить в модуле. — change
      `reduce-hero-css` — статус: в работе — ветка `reduce-hero-css` — PR: —.
- [ ] **Предупреждение lint в `useHotelSearch`.** `src/hooks/useHotelSearch.ts:43` —
      `react(set-state-in-effect)`. Стартовые даты вычислять при рендере, «сегодня» читать через
      `useSyncExternalStore` с серверным снимком. — change `fix-search-dates-effect` — статус: в
      очереди этапа 1 — ветка `fix-search-dates-effect` — PR: —.
- [ ] **Сократить кастомный CSS страницы.** `HomePage`, `DestinationCard`, `TravelBanner`,
      `ui/SmartImage` — на Tailwind, проверка скриншотами. — change `reduce-page-css` — статус: в
      очереди этапа 1 — ветка `reduce-page-css` — PR: —.

Этап 2 — после merge `reduce-hero-css` и `reduce-page-css`:

- [ ] **Сжать таблицы `cn`.** Пакет `cn` ≈ 25,7 КБ сырых в чанке главной. Компилировать таблицы под
      классы проекта через `cn build` / `withCn`; внедрять при выигрыше от 2 КБ gzip. — change
      `compile-cn-tables` — статус: согласован, ждёт этапа 2 — ветка: — — PR: —.

## Ожидает согласования

- [ ] **Переделать разбор пожелания.** `parseWish` (`src/lib/assistant.ts`) ищет город по точному
      названию, поэтому «Хочу в Прагу» не находит Прагу (нет падежей). Не латать словоформами:
      заменить механизм на семантический. Требование: `openspec/specs/assistant-search/spec.md`,
      «Разбор пожелания». Отложено решением пользователя 2026-10-19 до оплаты провайдера модели;
      затем выбрать эмбеддинги по каталогу или LLM-запрос со структурированным ответом (провайдер,
      ключ, серверный route handler, стоимость, поведение без сети). Change не создан.

## Предложения

Нет.

## Выполнено

- [x] Стартовые даты от текущего дня, фокус календаря на первом доступном дне —
      `fix-default-search-dates` — #1, #2 — 2026-10-19.
- [x] Визуал виджетов на примитивах shadcn + Tailwind и `data-*`-состояниях Base UI —
      `migrate-composite-components`, задача 4.1 — #3 — 2026-10-19.
- [x] Предложены changes по TODO — #4 — 2026-10-19.
- [x] Удалён устаревший активный `fix-default-search-dates` — #5 — 2026-10-19.
- [x] Prettier, скрипты `format` и `format:check`, проект отформатирован — `add-prettier-format` —
      #6 — 2026-10-19.
- [x] Юнит-тесты `lib/search.ts`, `lib/assistant.ts`, `lib/dates.ts`, `lib/format.ts` на Vitest —
      `add-unit-tests` — #7 — 2026-10-19.
- [x] Сценарий в подсказках ищется общей `findScenario` (регистр, пробелы, «ё»/«е») —
      `fix-destination-scenario-search` — #8 — 2026-10-19.
- [x] Контракты Base UI покрыты component-тестами, расхождений нет — `verify-base-ui-contracts` —
      #9 — 2026-10-19.
- [x] Оценка серверных компонентов — `evaluate-server-components` — #10 — 2026-10-19; решение — в
      «Отклонено/неактуально».
- [x] Кастомный CSS `SearchPanel`, `RandomSearch`, `Header`, `SearchForm`, `AssistantSearch` на
      Tailwind, `globals.css` очищен — `reduce-custom-css` — #11 — 2026-10-19.
- [x] `validateSearch` проверяет пределы гостей из `GUEST_LIMITS` — #12 — 2026-10-19.
- [x] TODO разделён на «Запланировано» и «Сделано» — #13 — 2026-10-19.
- [x] Удалены 13 смерженных удалённых веток PR #1–#13 — решение пользователя, без PR — 2026-10-19.

## Отклонено/неактуально

- **Серверные компоненты главной.** Выигрыш меньше 1 КБ gzip из 235 КБ JS (оценка
  `evaluate-server-components`, #10). Тема закрыта решением пользователя — 2026-10-19.
- **Ленивая загрузка неактивных вкладок поиска.** Вкладки перестали бы сохранять введённое
  (`keepMounted`). Не делать — решение пользователя — 2026-10-19.
