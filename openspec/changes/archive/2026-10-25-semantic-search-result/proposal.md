## Why

`semanticSearch` (`src/lib/ai/semantic.ts`) возвращает `null` и когда ничего не найдено, и при сбое. `similarTurn` (`src/app/api/assistant/route.ts`) угадывает сбой по времени ответа, а эмбеддинги NVIDIA иногда висят 92–120 с.

## What Changes

- `semanticSearch` возвращает явный результат: найдено (отели), пусто или сбой (с причиной: нет ключа, таймаут, ошибка модели или базы).
- `similarTurn` пишет «поиск не ответил» только при сбое, без эвристики по времени; повтор другими словами — только после сбоя или пустого результата, как сейчас.
- Остальные вызовы (`src/lib/ai/turn.ts`, `src/components/VibeSearch/actions.ts`) при пустом результате и при сбое ведут себя как раньше — прежние правила.

## Impact

- Спецификация `semantic-search`, требование «Поиск по смыслу».
- Код: `src/lib/ai/semantic.ts`, `src/app/api/assistant/route.ts`, `src/lib/ai/turn.ts`, `src/components/VibeSearch/actions.ts`, их тесты.
