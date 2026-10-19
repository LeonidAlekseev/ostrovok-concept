# Proposal

## Why

`Hero.module.css` — самый большой CSS-модуль проекта (544 строки). Его используют `Hero.tsx` и `StatsPanel.tsx`. Часть правил — раскладка, отступы, типографика и карточка места — дублирует то, что выражают Tailwind-утилиты и примитивы `src/components/ui/*`. Задача продолжает `reduce-custom-css` для последнего крупного модуля.

## What Changes

- Перевести на Tailwind-утилиты и классы примитивов стили `Hero`, которые Tailwind выражает без потери читаемости: раскладку блока, текст, подсказку, карточку места, панель статистики.
- В модуле оставить то, что Tailwind не выражает или выражает хуже: слои глобуса и canvas, псевдоэлементы `::before` и `::after`, `@property --pin-scale`, `@keyframes`, составные селекторы пинов и подсказок, медиазапросы для этих правил.
- Отклонения по пикселям допустимы; визуальная проверка — сравнение скриншотов до и после.
- Логика и отрисовка глобуса (`globe*.ts`) не меняются.

Поведение не меняется, поэтому delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/components/Hero/Hero.tsx`, `src/components/Hero/StatsPanel.tsx`, `src/components/Hero/Hero.module.css`.
- `src/app/globals.css` не меняется. Если без этого не обойтись, исполнитель эскалирует: файл общий с `reduce-page-css`.
- Требования `openspec/specs/hero-globe/spec.md` должны выполняться как раньше.
- Источник: TODO, «Стили».
