## 1. Схема

- [x] 1.1 Миграция: `entities`, `evidence`, `calculations`, `claims`, `claim_evidence`, `relations`, `documents`, `document_chunks`, `tool_runs`, `tool_run_evidence` с FK, CHECK и индексами; `hotel_chunks_search`
- [x] 1.2 RLS: справочник читают anon и authenticated, пишет service role; `tool_runs` — только владелец; проверка на живой базе (`begin; set local role …; rollback`)
- [x] 1.3 `npm run db:push`, `npm run db:types`, `npm run docs:supabase`

## 2. Заполнение

- [x] 2.1 `src/lib/claimRows.ts`: строки шума EEA, оценки дня, мест OSM, отзывов и упоминаний; слияние и сравнение строк
- [x] 2.2 `scripts/lib/claims-store.ts` и `scripts/hotel-features.ts`: запись по естественным ключам, удаление устаревшего в своей части
- [x] 2.3 Прогон `npm run db:features` и повторный прогон без записей

## 3. Чтение

- [x] 3.1 `src/lib/db/claims.ts`: `loadHotelClaims`, `searchHotelChunks` (zod, anon, server-only)

## 4. Проверка

- [x] 4.1 Тесты `claimRows`, `db/claims`; README
