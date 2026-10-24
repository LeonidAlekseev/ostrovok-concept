## Why
Решение пользователя 2026-10-24: стекло панели поиска на главной (`section#search` → первый дочерний `div[data-search-panel="true"]`) должно быть прозрачнее и слабее размывать глобус, чтобы панель лежала поверх глобуса.

## What Changes
- Только у панели на главной (`src/components/SearchPanel/SearchPanel.tsx`):
  - `background: linear-gradient(150deg, color-mix(in srgb, var(--decor-assistant-sky) 35%, transparent), color-mix(in srgb, color-mix(in srgb, var(--decor-assistant-sky), var(--decor-assistant-mint)) 25%, transparent) 15%, color-mix(in srgb, var(--decor-assistant-mint) 35%, transparent));`
  - `backdrop-filter: blur(2px) saturate(150%);`
- Ободок, блик и запасной вид при `prefers-reduced-transparency: reduce` остаются общими из `glass.ts`.
- Окно Эвал на `/assistant` не меняется (его переделывает `assistant-chat-redesign`): в `glass.ts` заливка и размытие панели задаются отдельно от окна Эвал, без копирования остальных классов стекла.

## Impact
- `src/components/SearchPanel/glass.ts`, `src/components/SearchPanel/SearchPanel.tsx`, при необходимости тест панели. Specs не меняются.
