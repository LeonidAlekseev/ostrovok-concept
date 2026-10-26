## Why

Помощник `setScreen` в `src/test/screen.ts` понимал только `(min-width: Npx)`, поэтому тесты с `prefers-reduced-motion` и компоненты с `(min-width: 64rem)` ставили `window.matchMedia` вручную: одни заглушки не восстанавливались, другие отвечали «да» на все запросы сразу. Узкая раскладка Эвала (`NARROW`) нигде не проверялась, хотя `isWide()` в `AssistantSearch.tsx` решает, открывается ли последний чат и что делает «Новый чат».

## What Changes

- `src/test/screen.ts`: `setScreen(width, { reducedMotion })` понимает `(min-width)` в px и rem и `(prefers-reduced-motion: reduce)`. Существующие вызовы `setScreen(WIDE)` не меняются.
- Ручные заглушки `window.matchMedia` переведены на `setScreen`: `Hero.test.tsx`, `searchResultsTestKit.tsx` (`open`), `StarSearch.test.tsx`. Заглушка удаления `matchMedia` в `StarSearch.test.tsx` (`afterEach`) оставлена как есть.
- `AssistantLayout.test.tsx`: блок «раскладка Эвала на телефоне» (`NARROW`): список на `/assistant` без открытия свежего чата, чат скрыт классом `max-lg:hidden`, «Новый чат» открывает чат по собственному адресу.
- Требование в `test-suite`: экран и движение тестов задаются общим помощником.

## Impact

- Specs: `test-suite`.
- Code: только `src/test/screen.ts` и тестовые файлы. Код приложения не меняется.
