# TODO

Единый реестр задач. Редактирует только оркестратор. Задачи берутся в работу через OpenSpec change;
выполненные и неактуальные не удаляются, а переносятся в архивные разделы со ссылкой на PR.

## В работе

Этап 2:

- [ ] Свой CSS на Tailwind во всех компонентах: `Hero`, анимации `RandomSearch` и `AssistantSearch` в
      `@theme`, модули удалены, `@theme` без `static`, стандартные утилиты для
      `translate`/`scale`/`rotate`/`shadow` — `reduce-globe-css` — в работе. Обновлён по решению
      пользователя 2026-10-19: порог размера CSS отменён.

## Ожидает согласования

- [ ] **Переделать разбор пожелания.** `parseWish` (`src/lib/assistant.ts`) ищет город по точному
      названию, поэтому «Хочу в Прагу» не находит Прагу (нет падежей). Не латать словоформами:
      заменить механизм на семантический. Требование: `openspec/specs/assistant-search/spec.md`,
      «Разбор пожелания». Отложено решением пользователя 2026-10-19 до оплаты провайдера модели;
      затем выбрать эмбеддинги по каталогу или LLM-запрос со структурированным ответом (провайдер,
      ключ, серверный route handler, стоимость, поведение без сети). Change не создан.

## Предложения

- [ ] 7 уязвимостей high в dev-дереве: `braces` (GHSA-vfj7-8cjw-p6xm, исправленной версии нет) →
      `micromatch` → `fast-glob` → CLI `shadcn` — источник: `package.json` (`move-shadcn-dev-dependency`)
      — в продакшен-зависимостях 0 после #25; дождаться исправления `braces` или заменить CLI — лёгкий
      — нет.
- [ ] Скрипт съёмки и сравнения скриншотов (Chromium, pixelmatch) пересоздаётся в `/tmp` каждым
      исполнителем — источник: `reduce-search-css` — оформить в `scripts/` без коммита изображений —
      лёгкий — нет.

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
- [x] CI в GitHub Actions: lint, typecheck, тесты и `format:check` — `add-ci-checks` — #15 —
      2026-10-19.
- [x] Предупреждение lint `set-state-in-effect` в `useHotelSearch`: «сегодня» через
      `useSyncExternalStore`, стартовые даты при рендере — `fix-search-dates-effect` — #16 —
      2026-10-19.
- [x] Кастомный CSS `HomePage`, `DestinationCard`, `TravelBanner`, `ui/SmartImage` на Tailwind, четыре
      модуля удалены — `reduce-page-css` — #18 — 2026-10-19.
- [x] Кастомный CSS `Hero` на Tailwind: модуль 544 → 387 строк, эффекты глобуса остались в модуле —
      `reduce-hero-css` — #17 — 2026-10-19. Итог этапа на `5c7bb24`: CSS 92 896 байт (+3,2 %), gzip
      18 743 (+1,9 %) при принятом критерии «gzip растёт не больше чем на 2 %».
- [x] План этапа 1 и changes — #14 — 2026-10-19.
- [x] Удалены 13 смерженных удалённых веток PR #1–#13 — решение пользователя, без PR — 2026-10-19.
- [x] Скриншоты `openspec/**/screenshots/` вычищены из истории `main` и `dev` (`git filter-repo`, force
      push пользователем; pack 18,18 → 4,42 МБ), удалены 8 слитых веток PR #14–#21; SHA в TODO и
      архиве changes заменены на новые — решение пользователя, без PR — 2026-10-19.

- [x] CI: отмена устаревших прогонов только для `pull_request`, actions по SHA `v4.4.0`, команды
      проверок в README — `tune-ci-workflow` — #23 — 2026-10-19.
- [x] `run` валидирует даты по снимку `today` формы, тесты на смену дня и `replaceState` —
      `fix-search-today-snapshot` — #24 — 2026-10-19.
- [x] `shadcn` перенесён в `devDependencies`, `npm audit --omit=dev` 7 high → 0 —
      `move-shadcn-dev-dependency` — #25 — 2026-10-19.
- [x] Модули `SearchForm` и `SearchPanel` удалены, `RandomSearch` и `AssistantSearch` сведены к
      `@keyframes`, правило `translate`/`scale`/`shadow` в README — `reduce-search-css` — #26 —
      2026-10-19. CSS 92 896 → 97 752 байт (+5,2 %), gzip 18 743 → 19 202 (+2,4 %); рост принят
      решением пользователя.
- [x] План этапа 2026-10-19-2, скриншоты вне репозитория (`.gitignore`) — #22 — 2026-10-19.

## Отклонено/неактуально

- **Серверные компоненты главной.** Выигрыш меньше 1 КБ gzip из 235 КБ JS (оценка
  `evaluate-server-components`, #10). Тема закрыта решением пользователя — 2026-10-19.
- **Сжать таблицы `cn` через `cn build` / `withCn`.** Выигрыш JS главной 1 996 Б gzip (5 686 Б
  сырых) меньше согласованного порога 2 КБ; код откачен, реализация — коммит `c76a830` в истории
  `dev` — `compile-cn-tables` — #20 — 2026-10-19.
- **Ленивая загрузка неактивных вкладок поиска.** Вкладки перестали бы сохранять введённое
  (`keepMounted`). Не делать — решение пользователя — 2026-10-19.
