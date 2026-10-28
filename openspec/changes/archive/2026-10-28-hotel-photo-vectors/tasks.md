## 1. База

- [x] 1.1 Миграция: `hotel_photo_embeddings`, HNSW, RLS, `match_hotel_photos`; проверка в `begin … rollback`
- [x] 1.2 Типы `database.types.ts`, SQL-тест `supabase/tests/hotel_photo_embeddings.sql`

## 2. Сервер

- [x] 2.1 `photoEmbedding.ts`: клиент модели, проверка фото, `photoKey`, `contentHash`
- [x] 2.2 `photoSearch.ts`: поиск отелей по фото пользователя
- [x] 2.3 `similarTurn`: поиск по вектору фото, откат на описание

## 3. Загрузка

- [x] 3.1 `scripts/embed-photos.ts` и `npm run db:embed:photos`

## 4. Тесты и документация

- [x] 4.1 Тесты клиента, поиска, маршрута
- [x] 4.2 README, спеки, проверки, архив
