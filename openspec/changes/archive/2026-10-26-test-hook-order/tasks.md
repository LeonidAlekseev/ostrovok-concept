## 1. Порядок хуков

- [x] 1.1 `sequence: { hooks: 'list' }` в `vitest.config.ts` с комментарием, зачем
- [x] 1.2 Проверить 11 файлов из TODO (`useChats`, `AssistantLayout`, `AssistantPage`, `AssistantPhotos`, `HotelAssistant`, `Trips`, `FavoritesPage`, `BookingPage`, `ConfirmationPage`, `FavoriteButton`, `HotelTile`): хуки, которые полагались на обратный порядок, поправить (проверено: ни один не полагается на обратный порядок, правок не потребовалось)
- [x] 1.3 Убрать лишний `cleanup()` из `afterEach` в `AssistantSearch.test.tsx`; тест «AssistantSearch from one test to the next» остаётся и проходит

## 2. Режим экрана

- [x] 2.1 Помощник в `src/test/` для явного `matchMedia` (широкий/узкий экран); тесты, зависящие от `isWide()`, задают режим явно

## 3. Проверка

- [x] 3.1 `npm test` три раза подряд зелёный; файлы из 1.2 — по 20 прогонов подряд
- [x] 3.2 lint, typecheck, format:check, `openspec validate --all --strict`
