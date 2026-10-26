## 1. Помощник

- [x] 1.1 `setScreen` понимает `(min-width)` в rem и `prefers-reduced-motion` (параметр `reducedMotion`)

## 2. Ручные заглушки

- [x] 2.1 `Hero.test.tsx`: `setScreen(NARROW, { reducedMotion })` — ширина телефона, как и раньше (`phone` в `cardShift`)
- [x] 2.2 `searchResultsTestKit.tsx` (`open`): `setScreen(desktop ? WIDE : NARROW)`
- [x] 2.3 `StarSearch.test.tsx`: `setScreen(WIDE, { reducedMotion: true })`; `afterEach` с удалением `matchMedia` оставлен

## 3. Узкая раскладка Эвала

- [x] 3.1 `AssistantLayout.test.tsx`: список на `/assistant`, чат скрыт, «Новый чат» по собственному адресу

## 4. Проверка

- [x] 4.1 lint, typecheck, `npm test`, `format:check`, `openspec validate --all --strict`
