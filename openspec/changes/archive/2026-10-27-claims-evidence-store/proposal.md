## Why

Эвал отвечает о шуме по строкам, собранным на лету (`noiseLines`), и не может показать, откуда каждое значение, насколько оно надёжно и что из него выведено. Полосы EEA, оценка дня, шумные места OSM и слова гостей в отзывах — данные разной природы, а лежат в разных таблицах с разными ключами. Нужна общая база: что известно об отеле, с каким эпистемическим статусом, по каким доказательствам и каким расчётом — чтобы следующий change (`tool-run-contract`) построил на ней инструмент «Анализ шума» и прозрачные шаги Эвала.

## What Changes

- Миграция `20261027220000_claims_evidence_store.sql`: реестр сущностей `entities`, утверждения `claims` (одно типизированное значение, статус observed/reported/derived/inferred, confidence 0..1 или NULL, метод, ссылка на расчёт), доказательства `evidence` и `claim_evidence`, расчёты `calculations`, связи `relations` (KAG), документы `documents` и фрагменты `document_chunks` с `tsvector` (русский стеммер, GIN) и пустым пока `halfvec(2048)` (RAG), функция `hotel_chunks_search`; `tool_runs` и `tool_run_evidence` для следующего change. RLS: справочник читают anon и authenticated, пишет только service role; запуски инструментов видит только владелец чата.
- `npm run db:features` заполняет хранилище для настоящих отелей Валенсии: полосы EEA у точки (`reported`), оценка Lday (`derived` с расчётом по 2002/49/EC), шумные места OSM в 200 м (сущности, связи `near`, расстояния и счёт по категориям — `derived`), отзывы как документы и фрагменты, упоминания шума и тишины в отзывах (`reported`, цитата без вывода). Идемпотентно: пишет только новое и изменённое, удаляет устаревшее только в своей части.
- `src/lib/db/claims.ts`: `loadHotelClaims(hotelId, propertyPrefix)` с доказательствами и расчётом, `searchHotelChunks(hotelId, query)` по полнотекстовому индексу.
- Типы `database.types.ts`, OpenAPI-раздел Supabase, README.

Не меняются: `hotel_features`, поиск, чат, маршрут ассистента, UI.

## Capabilities

### New Capabilities

- `hotel-knowledge`: хранилище утверждений об отелях с доказательствами и расчётами, документы для поиска, запуски инструментов.

### Modified Capabilities

## Impact

- База: миграция `20261027220000_claims_evidence_store.sql` (10 таблиц, функция, RLS).
- Код: `src/lib/claimRows.ts`, `scripts/lib/claims-store.ts`, `scripts/hotel-features.ts`, `src/lib/db/claims.ts`, `src/lib/db/database.types.ts`, `src/lib/openapi/supabase.gen.json`, README.
