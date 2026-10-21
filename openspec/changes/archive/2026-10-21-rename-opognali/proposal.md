## Why

Пользователь 2026-10-21: проект становится Travel OS «О!Погнали»; название сайта меняется в заголовках, шапке, подвале и метаданных.

## What Changes

- «Островок!» → «О!Погнали» везде в интерфейсе: логотип и его `aria-label`, `<title>` и `metadata` всех страниц, подвал, тексты помощи и правовых страниц (`src/data/legal.ts`), подписи в картинках и видео для соцсетей (`src/lib/shareMedia.ts`), тесты.
- Purpose спек с названием обновить.
- Имя репозитория, пакета и домен не меняются.

## Impact

`src/app/**/page.tsx`, `layout.tsx`, `not-found.tsx`, `Header`, `Footer`, `src/data/legal.ts`, `src/lib/shareMedia.ts`, тесты, спеки `site-header`, `app-shell` и Purpose `design-system`, `home-page`.
