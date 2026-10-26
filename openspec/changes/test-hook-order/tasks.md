## 1. Порядок хуков

- [ ] 1.1 `sequence: { hooks: 'list' }` в `vitest.config.ts` с комментарием, зачем
- [ ] 1.2 Проверить 11 файлов из TODO (`useChats`, `AssistantLayout`, `AssistantPage`, `AssistantPhotos`, `HotelAssistant`, `Trips`, `FavoritesPage`, `BookingPage`, `ConfirmationPage`, `FavoriteButton`, `HotelTile`): хуки, которые полагались на обратный порядок, поправить
- [ ] 1.3 Убрать лишний `cleanup()` из `afterEach` в `AssistantSearch.test.tsx`; тест «AssistantSearch from one test to the next» остаётся и проходит

## 2. Режим экрана

- [ ] 2.1 Помощник в `src/test/` для явного `matchMedia` (широкий/узкий экран); тесты, зависящие от `isWide()`, задают режим явно

## 3. Проверка

- [ ] 3.1 `npm test` три раза подряд зелёный; файлы из 1.2 — по 20 прогонов подряд
- [ ] 3.2 lint, typecheck, format:check, `openspec validate --all --strict`
