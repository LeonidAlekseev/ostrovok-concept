# TODO

Единый реестр задач. Редактирует только оркестратор. Задачи берутся в работу через OpenSpec change;
выполненные и неактуальные не удаляются, а переносятся в архивные разделы со ссылкой на PR.

## В работе

Нет.

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

- [ ] Перевести на стандартные утилиты остатки произвольных свойств: `transform: translateY(…)` в
      `style` ленты барабана и `[transition:…]` — источник: `src/components/SearchPanel/RandomSearch.tsx:316`,
      `src/components/SearchForm/GuestsField.tsx:49`, `src/components/DestinationCard/DestinationCard.tsx:18`
      (`reduce-globe-css`) — правило утилит README не покрывает `style` и `transition` — лёгкий — нет.
- [ ] Единое поведение наведения на тач-устройствах: `Hero` использует `[&:hover]`, остальные — `hover:`
      (только при `(hover: hover)`) — источник: `src/components/Hero/Hero.tsx:90`,
      `src/components/DestinationCard/DestinationCard.tsx:42` (`reduce-globe-css`) — выбрать вариант,
      записать в README; при `[&:hover]` — `@custom-variant` вместо `!` — лёгкий — решение пользователя.
- [ ] Анимация раскрытия аккордеона: из `ui/accordion` убраны `animate-accordion-*`, keyframes нет —
      источник: `src/components/ui/accordion.tsx` (`add-help-and-legal-pages`) — добавить
      `--animate-accordion-*` в `@theme` — лёгкий — нет.
- [ ] 404 и ошибка предложения на оформлении ведут на `/#search` как временная замена `/search` —
      источник: `src/app/not-found.tsx`, `src/components/BookingPage/BookingPage.tsx`
      (`add-prototype-foundation`, `add-booking-checkout`) — оставить или вести на поиск с главной;
      `/search` без направления показывает форму с ошибкой — лёгкий — нет.
- [ ] Дубли хелперов: `cancellationText` против `cancellationLabel`, `decimal` против `formatRating`,
      `DEFAULT_GUESTS` в `useStay` — источник: `src/components/RatesPage/RoomRates.tsx:15`,
      `src/components/SearchResultsPage/HotelCard.tsx:14`, `src/components/StayBar/useStay.ts:9` — свести
      к общим функциям `src/lib/*` — лёгкий — нет.
- [ ] Общий компонент деталей бронирования для подтверждения и «Моих поездок» — источник:
      `src/components/BookingConfirmation/ConfirmationPage.tsx:14` (`add-account-pages`) — списки строк
      почти совпадают — лёгкий — нет.
- [ ] Вариант `destructive` у `ui/button` для подтверждения отмены — источник:
      `src/components/ui/button.tsx:10` (`add-account-pages`) — сейчас отмена в основном стиле — лёгкий —
      нет.
- [ ] Демо-вход по email даёт имя без фамилии, а оформление требует фамилию — источник:
      `src/components/Auth/AuthForm.tsx` (`add-account-pages`) — запрашивать фамилию при входе или
      принимать одно имя — лёгкий — решение пользователя.
- [ ] «Избранное» в шапке дважды: иконка и пункт меню пользователя — источник:
      `src/components/Header/Header.tsx` (`add-auth-pages`) — оставить одно — лёгкий — решение
      пользователя.
- [ ] Подпись `PhotoPlaceholder` не помещается в плитку 96×64 в сводке заказа — источник:
      `src/components/ui/PhotoPlaceholder.tsx` (`add-booking-checkout`) — `truncate` или скрывать подпись
      — лёгкий — нет.
- [ ] Шум jsdom «Not implemented: navigation to another Document» в `npm test` — источник:
      `src/test/setup.ts` (`add-booking-checkout`) — перехватывать клики по ссылкам в setup — лёгкий —
      нет.
- [ ] Turbopack копирует в `.next/static/media` около 5 МБ `.mjs` из `maplibre-gl/dist` (грузится только
      воркер) — источник: `add-search-results-page` — растёт размер деплоя; проверить исключение — лёгкий
      — нет.
- [ ] Устаревший комментарий про фон `html` после появления подвала — источник:
      `src/app/globals.css:282` (`add-prototype-foundation`) — уточнить — лёгкий — нет.

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
- [x] Свой CSS на Tailwind во всех компонентах: модулей нет, анимации в `@theme`, `@theme` без
      `static`, стандартные утилиты для `translate`/`scale`/`rotate`/`shadow` — `reduce-globe-css` — #29
      — 2026-10-19. CSS 97 752 → 111 912 байт (+14,5 %), gzip 19 202 → 20 295 (+5,7 %); порог отменён
      пользователем.
- [x] Итог этапа 1 и обновлённый `reduce-globe-css` — #27 — 2026-10-19.
- [x] План шаблонов основных страниц — #28 — 2026-10-19.
- [x] Основа прототипа: каркас (шапка, подвал, 404), каталог отелей, хранилища в `localStorage`,
      контракт предложения, кнопка избранного — `add-prototype-foundation` — #30 — 2026-10-19.
- [x] Страница отеля и выбор тарифа (`/hotels/<id>`, `/hotels/<id>/rooms`) — `add-hotel-pages` — #31 —
      2026-10-19.
- [x] Оформление и подтверждение бронирования (`/booking`, `/booking/confirmation`) —
      `add-booking-checkout` — #32 — 2026-10-19.
- [x] Результаты поиска `/search`: список, фильтры, сортировка, карта MapLibre; поиск с главной ведёт
      на `/search` — `add-search-results-page` — #33 — 2026-10-19.
- [x] Вход и регистрация: модальное окно и страницы `/login`, `/register`, меню пользователя —
      `add-auth-pages` — #34 — 2026-10-19.
- [x] Мои поездки, детали бронирования (изменение, отмена), избранное — `add-account-pages` — #35 —
      2026-10-19.
- [x] Поддержка и FAQ, юридические страницы — `add-help-and-legal-pages` — #36 — 2026-10-19.
- [x] Подборки отелей на главной — `add-home-collections` — #37 — 2026-10-19.
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
