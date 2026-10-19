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
