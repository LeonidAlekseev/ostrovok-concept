# Proposal

## Why

Пользователь 2026-10-20: «Сменить рукописный шрифт на более изысканный для текста „Крути глобус…“». Ответы: 25б (Great Vibes), 26а (везде, где Caveat).

## What Changes

- Акцентный рукописный шрифт Caveat 600 заменяется на Great Vibes 400 (кириллица, OFL-1.1) во всех местах: подсказка у глобуса «Вращай глобус — воплощай мечту», подпись в окне гадания, прогноз в результате.
- У Great Vibes один вес 400: убрать `font-semibold` у этих текстов, размер подобрать заново, чтобы текст читался (особенно на 360 px).
- Пакет `@fontsource/caveat` удаляется, добавляется `@fontsource/great-vibes`.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `home-page`: типографика.

## Impact

- `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/app/globals.css` (`--font-hand`), `src/components/Hero/Hero.tsx`, `src/components/StarSearch/{StarSearchDialog,StarResult}.tsx`.
- Запуск после `redesign-star-search`: он меняет те же файлы гадания.
