# Proposal

## Why

Находки исполнителей (TODO, «Предложения»):
- `npm test` печатает шум jsdom «Not implemented: navigation to another Document» при кликах по ссылкам (`src/test/setup.ts`);
- Turbopack копирует в `.next/static/media` около 5 МБ `.mjs` из `maplibre-gl/dist`, а браузер грузит только воркер — растёт размер деплоя (`add-search-results-page`);
- скрипт съёмки и сравнения скриншотов (headless Chromium, pixelmatch) каждый исполнитель пишет заново в `/tmp`.

## What Changes

- В `src/test/setup.ts` перехватывать навигацию по ссылкам в jsdom, чтобы вывод тестов был чистым; тесты, которые проверяют `href`, не меняются.
- Исключить лишние `.mjs` MapLibre из сборки (например, импорт конкретного файла воркера через `new URL(…, import.meta.url)` или настройка Turbopack); записать размер `.next/static/media` до и после; карта по-прежнему работает.
- `scripts/screenshots.mjs` (или аналог): съёмка списка URL и состояний в двух viewport, сравнение с базой pixelmatch threshold 0.1, вывод в каталог вне репозитория (по умолчанию `/tmp/<name>-screenshots`); README — раздел о визуальной проверке. Изображения в репозиторий не попадают. Новые devDependencies — только если без них нельзя (сначала проверить установленные).

Поведение приложения не меняется; delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/test/setup.ts`, модуль карты на `/search` и/или `next.config.*`, `scripts/*`, `README.md`, возможно `package.json` (скрипт, devDependencies).
- Источник: TODO, «Предложения».
