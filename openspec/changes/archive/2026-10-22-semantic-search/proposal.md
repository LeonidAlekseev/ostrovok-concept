## Why

Решения 99а и 102а: поиск по смыслу на эмбеддингах и реранжировании nemotron для чата помощника и «Найди свой вайб» в этапе B, а затем персонализация планов (109а: замена отеля по эмбеддингам отеля и пользователя). Векторы — в Supabase pgvector.

## What Changes

- Миграция: расширение `vector`, таблица `embeddings` (`kind` — `hotel` / `route`, `ref_id`, `model`, `content_hash`, `embedding vector(N)`), индекс HNSW (косинус), SQL-функция поиска ближайших (`match_embeddings(query, kind, filter, k)`), RLS — чтение функцией для всех, запись — сервисный ключ.
- Скрипт `npm run db:embed`: текст объекта (название, тип, город, описание, удобства, вайб-оси, отзывы кратко; у маршрутов — персона, описание, досуг) → `nvidia/nemotron-3.5-embed-8b:free` (`textEmbeddingModel` провайдера OpenRouter) → upsert; пропуск неизменённых по `content_hash`; батчи и повтор при 429.
- Адаптер реранжирования `RerankingModelV4` для `nvidia/nemotron-3.5-rerank-8b:free` (провайдер OpenRouter его не даёт) в `src/lib/ai/rerank.ts`; `rerank()` AI SDK.
- `src/lib/ai/semantic.ts` (server-only): `semanticSearch(text, { kind, destinationIds?, k })` = эмбеддинг запроса → pgvector top-K → rerank → top-N; таймаут, лимит, без ключа/при ошибке — `null`, вызывающий код берёт прежние правила.
- Помощник (`/api/assistant`): кандидаты отелей по смыслу пожелания (настроение, «тихо», «для работы») вместо/вместе с правилами; город и бюджет — прежние правила и модель.
- «Найди свой вайб»: текст из выбранных полюсов → семантический подбор отелей; прежний расчёт по осям — запасной.
- `rankHotelAlternatives(current, candidates, profile?)` (появится в `trip-copy`): если change уже в `dev` — подключить `profile` (вектор пользователя: среднее векторов избранного, отелей броней и планов); если нет — экспортировать `userProfileVector(userId)` и `similarHotels(hotelId, profile?)` для него.

## Impact

`supabase/migrations/*_embeddings.sql`, `scripts/embed.ts`, `package.json`, `src/lib/ai/{rerank,semantic}.ts`, `src/app/api/assistant/route.ts`, вайб (server action), тесты (моки модели и базы), README. Новая спека `semantic-search`, спеки `assistant-search`, `vibe-search` (дельты при необходимости).
