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

## Решения

- **Навигация jsdom.** В `src/test/setup.ts` слушатель `click` на `document` (фаза всплытия) отменяет действие по умолчанию для `a[href]`; обработчики компонентов отрабатывают раньше и видят неотменённое событие.
- **Лишние `.mjs`.** Причина — сам `maplibre-gl.mjs`: его поиск воркера по умолчанию `new URL('./' + name, import.meta.url)` заставляет Turbopack копировать все `.mjs` из `maplibre-gl/dist` (6 файлов: основной и `-dev`, `shared`, `worker`). `setWorkerUrl` в `SearchMap.tsx` задаёт воркер явно, поэтому нужен только он. Решение: `turbopack.rules` для `maplibre-gl.mjs` с мини-загрузчиком `config/maplibre-no-asset-glob.cjs`, подменяющим `import.meta.url` на заглушку. Файл библиотеки на диске не меняется. Риск: при обновлении MapLibre подмена может перестать быть нужной или измениться — проверять размер `.next/static/media`.
- **Размер `.next/static/media`:** до — 5732 КБ (`du -sk`; `.mjs`: 0,5 + 1,1 + 1,2 + 2,5 МБ и `shared`), после — 996 КБ (остался один воркер, 519 КБ). Карта на `/search?destination=prague` в `next start` (Chromium, swiftshader): 6 маркеров видны, воркер грузится, ошибок в консоли нет.
- **Скрипт скриншотов.** Нужны новые devDependencies: `playwright-core` (драйвер Chromium; готовый браузер уже в кэше ms-playwright), `pixelmatch` (сравнение), `pngjs` (+ `@types/pngjs`; чтение и запись PNG для pixelmatch). Установленных замен в проекте нет. Глобус на `/` анимируется непрерывно, поэтому для воспроизводимости есть `--mask` (на `/` — `canvas`); без маски повторная съёмка отличается на ~0,01 %.
- **Прогон на `/`:** `--mask canvas`, два viewport, повторная съёмка — 0,000 % и 0,000 %.
