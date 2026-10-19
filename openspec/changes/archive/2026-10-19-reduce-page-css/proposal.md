# Proposal

## Why

`reduce-custom-css` перевёл на Tailwind пять компонентов поиска и шапку. Остались CSS-модули страницы: `HomePage.module.css` (74 строки), `DestinationCard.module.css` (119), `TravelBanner.module.css` (89) и `ui/SmartImage.module.css` (6). Цель та же: меньше CSS на клиенте и без дублей с утилитами Tailwind и примитивами `src/components/ui/*`.

## What Changes

- Перевести стили `HomePage`, `DestinationCard`, `TravelBanner` и `SmartImage` на Tailwind-утилиты и классы примитивов.
- Модульный CSS оставить только для того, что Tailwind не выражает. Файл, в котором ничего не осталось, удалить.
- Отклонения по пикселям допустимы; визуальная проверка — сравнение скриншотов до и после, как в `reduce-custom-css`.
- `Hero` не входит: он в отдельном change `reduce-hero-css`.

Поведение не меняется, поэтому delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/components/HomePage.tsx`, `src/components/HomePage.module.css`.
- `src/components/DestinationCard/*`, `src/components/TravelBanner/*`, `src/components/ui/SmartImage.*`.
- `src/app/globals.css` не меняется. Если без этого не обойтись, исполнитель эскалирует: файл общий с `reduce-hero-css`.
- README, раздел «Стили», если меняется описание гибрида Tailwind и CSS Modules.
- Источник: TODO, «Стили».

## Замеры

До изменений (`npm run build` от `5ba72bd`): суммарный размер CSS сборки — **90 025 байт** (gzip −9: 18 396 байт). `.next/static/chunks/*.css`: `354nw1q3dvd5y.css` — 68 418 байт, `1qekd7_aj54ei.css` — 21 607 байт.

После изменений: **92 054 байт** (gzip −9: 18 606 байт), то есть +2 029 байт (+2,3 %), gzip +210 байт (+1,1 %). Чанки: `3bi27-2po046s.css` — 75 859 байт, `0nwjbi5t0rj3a.css` — 16 195 байт.

Размер вырос, а не упал: четыре модуля (≈290 строк CSS, около −6,9 КБ в минифицированном виде) заменены утилитами, которые минификатор Tailwind раскрывает длиннее (экранированные имена классов с arbitrary values, `@supports`-дубли для `color-mix`) плюс новые `@property` для `translate`, `scale`, `rotate`. Первая версия на «чистых» утилитах (`shadow-[…]`, `bg-linear-*`, `translate-*`) давала +5 925 байт; переход на arbitrary properties (`[box-shadow:…]`, `[translate:…]`, `[background:…]`) срезал большую часть.

Решение пользователя 2026-10-19: критерий — gzip CSS растёт не больше чем на 2 %; рост сырого размера принят.

Скриншоты: `screenshots/before` (сборка `5ba72bd`), `screenshots/after`, `screenshots/diff` — 14 кадров в двух viewport (1280×900 и 390×844): главная целиком, секция «Популярные направления», карточка обычная, hover и выбранная (`aria-pressed`), баннер, заглушка `SmartImage` при ошибке загрузки; headless Chromium, `prefers-reduced-motion: reduce`, глобус скрыт, время и `Math.random` зафиксированы. Повторная съёмка «до» совпадает с первой на 0,000 %. Попиксельное сравнение (pixelmatch, threshold 0.1): отличие 0,000 % во всех 14 кадрах.
