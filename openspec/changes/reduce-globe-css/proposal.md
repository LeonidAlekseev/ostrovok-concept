# Proposal

## Why

`reduce-hero-css` оставил в `src/components/Hero/Hero.module.css` 387 строк: эффекты глобуса и связанные с ними правила. Пока модули читают токены темы во время выполнения, `@theme` в `src/app/globals.css:137` объявлен `static`, и в сборку попадают все токены, включая неиспользуемые (`Hero.module.css:1`). После `reduce-search-css` `Hero` — последний модуль, который держит `static`.

## What Changes

- Перевести на Tailwind то, что выражается утилитами, в `Hero.tsx`, `StatsPanel.tsx` и связанных компонентах `Hero`. В модуле оставить только то, что Tailwind не выражает: `@keyframes`, маски, сложные градиенты и правила, завязанные на пользовательские свойства глобуса.
- Убрать `static` у `@theme`. Если модулю нужен токен темы во время выполнения, ссылаться на него так, чтобы Tailwind его видел, или вынести значение в `:root`; выбор обосновать в design.md.
- Привести к политике `translate`/`scale`/`shadow` из README (её записывает `reduce-search-css`) уже переведённые файлы: `HomePage`, `DestinationCard`, `TravelBanner`, `Header`, `Hero`.
- Критерий размера: gzip CSS сборки растёт не больше чем на 2 % относительно замера до изменений.

Поведение не меняется, delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/components/Hero/*`, `src/app/globals.css` (только `@theme` и при необходимости `:root`).
- Файлы, приводимые к политике: `src/components/HomePage.tsx`, `DestinationCard/*`, `TravelBanner/*`, `Header/*`.
- `README.md`, раздел «Стили».
- Зависит от `reduce-search-css`: начинается после его merge в `dev`.
- Источник: TODO, «Предложения», пункты 6–7.
