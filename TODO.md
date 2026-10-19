# TODO

Единый реестр задач. Редактирует только оркестратор. Задачи берутся в работу через OpenSpec change;
выполненные и неактуальные не удаляются, а переносятся в архивные разделы со ссылкой на PR.

## В работе

Этап 2:

- [ ] **Сжать таблицы `cn`.** Пакет `cn` ≈ 25,7 КБ сырых в чанке главной. Компилировать таблицы под
      классы проекта через `cn build` / `withCn`; внедрять при выигрыше от 2 КБ gzip. — change
      `compile-cn-tables` — статус: в работе — ветка `compile-cn-tables` — PR: —.

## Ожидает согласования

- [ ] **Переделать разбор пожелания.** `parseWish` (`src/lib/assistant.ts`) ищет город по точному
      названию, поэтому «Хочу в Прагу» не находит Прагу (нет падежей). Не латать словоформами:
      заменить механизм на семантический. Требование: `openspec/specs/assistant-search/spec.md`,
      «Разбор пожелания». Отложено решением пользователя 2026-10-19 до оплаты провайдера модели;
      затем выбрать эмбеддинги по каталогу или LLM-запрос со структурированным ответом (провайдер,
      ключ, серверный route handler, стоимость, поведение без сети). Change не создан.

## Предложения

- [ ] `concurrency` с `cancel-in-progress: true` отменяет и прогоны на push в `main` и `dev` —
      источник: `.github/workflows/ci.yml:11` (`add-ci-checks`) — после merge без проверки остаётся
      только последний push; отменять только прогоны `pull_request` — лёгкий — нет.
- [ ] Закрепить `actions/checkout` и `actions/setup-node` по SHA — источник:
      `.github/workflows/ci.yml:20`, `.github/workflows/ci.yml:22` (`add-ci-checks`) — защита от
      подмены тега стороннего action — лёгкий — нет.
- [ ] Добавить `npm test` и `npm run format:check` в список команд раздела «Запуск» — источник:
      `README.md:15` (`add-ci-checks`) — список локальных команд неполон — лёгкий — нет.
- [ ] `run` валидирует даты по `todayIso()`, а форма — по снимку `today` из `useSyncExternalStore` —
      источник: `src/hooks/useHotelSearch.ts:69` (`fix-search-dates-effect`) — после полуночи на
      открытой вкладке стартовые даты и валидация могут разойтись; передавать в `run` тот же снимок —
      лёгкий — нет.
- [ ] `window.history.replaceState` внутри хука без теста — источник:
      `src/hooks/useHotelSearch.ts:80` (`fix-search-dates-effect`) — побочный эффект не покрыт;
      добавить тест на запись параметров в URL — лёгкий — нет.
- [ ] Перевести оставшиеся CSS-модули (`Hero` — только эффекты глобуса, `SearchForm`,
      `SearchPanel`, `RandomSearch`, `AssistantSearch`) и после этого убрать `static` у `@theme` —
      источник: `src/app/globals.css:137` (`reduce-page-css`), `src/components/Hero/Hero.module.css:1`
      (`reduce-hero-css`) — `static` нужен только для чтения токенов из модулей и тянет в сборку
      неиспользуемые токены; учесть критерий «gzip CSS растёт не больше чем на 2 %» — средний — нет.
- [ ] Единая политика для `translate`/`scale`/`shadow`: arbitrary properties или стандартные
      утилиты с `@property` — источник: `reduce-page-css` (стандартные утилиты давали +5 925 байт
      CSS) — сейчас подходы смешаны — лёгкий — связано с предыдущим пунктом.
- [ ] 7 уязвимостей high в `npm audit` (`braces` → `micromatch` → `fast-glob`, через CLI `shadcn` в
      `dependencies`) — источник: `package.json` (`reduce-page-css`) — в клиентский бандл не попадает,
      из пакета используется только `shadcn/tailwind.css`; проверить перенос в `devDependencies` и
      обновление `shadcn` — лёгкий — нет.

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
      `reduce-hero-css` — #17 — 2026-10-19. Итог этапа на `d495b35`: CSS 92 896 байт (+3,2 %), gzip
      18 743 (+1,9 %) при принятом критерии «gzip растёт не больше чем на 2 %».
- [x] План этапа 1 и changes — #14 — 2026-10-19.
- [x] Удалены 13 смерженных удалённых веток PR #1–#13 — решение пользователя, без PR — 2026-10-19.

## Отклонено/неактуально

- **Серверные компоненты главной.** Выигрыш меньше 1 КБ gzip из 235 КБ JS (оценка
  `evaluate-server-components`, #10). Тема закрыта решением пользователя — 2026-10-19.
- **Ленивая загрузка неактивных вкладок поиска.** Вкладки перестали бы сохранять введённое
  (`keepMounted`). Не делать — решение пользователя — 2026-10-19.
