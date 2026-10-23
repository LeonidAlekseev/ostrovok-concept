# Proposal

## Why

Пользователь 2026-10-22: «Шрифт надо вернуть на самый первый, который был» — Caveat 600, как до `switch-hand-font` (#78). Вариант с TT Lovelies Script (PR #97) закрыт без слияния.

## What Changes

- Рукописный шрифт `--font-hand` — снова Caveat 600 (`@fontsource/caveat/600.css`) вместо Great Vibes; `@fontsource/great-vibes` удаляется.
- Подсказка у глобуса, подпись в окне гадания и прогноз в результате — с прежними `font-semibold` и размерами, как до #78.
- Глобус на 768–979 px и карточка нового отеля — на прежнем месте, как до #78 (убрать `md:max-lg:[--globe-x:84%]` и `max-lg` у размещения карточки).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `home-page`: типографика.

## Impact

- `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/app/globals.css` (`--font-hand`), `src/components/Hero/Hero.tsx`, `src/components/StarSearch/{StarSearchDialog,StarResult}.tsx`.
