# Proposal

## Why

Пользователь 2026-10-21 прислал шрифт TT Lovelies Script (zip: TTF, WOFF2 и др.) для рукописных текстов (38б): вернуть глобус на 768–979 px на прежнее место и решить пересечение подсказки с пинами новым шрифтом.

## What Changes

- Рукописный шрифт Great Vibes заменяется на TT Lovelies Script во всех местах `font-hand`: подсказка у глобуса, окно и результат гадания.
- Шрифт подключается локально (`next/font/local` или `@font-face` в `globals.css`) из `src/app/fonts/` (или `public/fonts/`) — только подмножество глифов (латиница, кириллица, знаки препинания), WOFF2. Исходный файл 457 КБ — после подмножества цель ≤ 60 КБ.
- `@fontsource/great-vibes` удаляется.
- Глобус на 768–979 px возвращается на место до #78 (`md:max-lg:[--globe-x:84%]` и `max-lg` у размещения карточки убрать); пересечение подсказки с пинами снимается кеглем, шириной и положением подсказки под новый шрифт.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `home-page`: типографика, подсказка у глобуса.

## Impact

- `src/app/layout.tsx`, `src/app/globals.css` (`--font-hand`), `src/components/Hero/Hero.tsx`, `src/components/StarSearch/{StarSearchDialog,StarResult}.tsx`, `package.json`.
- Новый файл шрифта (подмножество). Исходники вне репозитория: `/tmp/use-lovelies-font-sources/`.
- Лицензия шрифта: TT Lovelies Script — шрифт TypeType; файл предоставил пользователь, веб-лицензия — на его стороне. В репозиторий кладём только подмножество WOFF2.
