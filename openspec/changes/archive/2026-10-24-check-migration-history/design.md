# Сверка истории миграций Supabase

Режим: только чтение. Запросы: `select` по `supabase_migrations.schema_migrations`, `information_schema`, `pg_catalog` (через `supabase db query --db-url`). DDL и DML не выполнялись. База не менялась.

## 1. История миграций

| # | Файл `supabase/migrations/` | Версия в `schema_migrations` | Имя в `schema_migrations` | Совпадение |
|---|---|---|---|---|
| 1 | `20261021120000_foundation.sql` | `20261021120000` | `foundation` | да |
| 2 | `20261022120000_routes.sql` | `20261022120000` | `routes` | да |
| 3 | `20261022130000_catalog_position.sql` | `20261022130000` | `catalog_position` | да |
| 4 | `20261022140000_catalog_stay_types.sql` | `20261022140000` | `catalog_stay_types` | да |
| 5 | `20261022150000_embeddings.sql` | `20261022150000` | `embeddings` | да |
| 6 | `20261022170500_trips.sql` | `20261022170500` | `trips` | да |
| 7 | `20261023120000_valencia_geo.sql` | `20261023120000` | `valencia_geo` | да |
| 8 | `20261023140000_ota_hotels.sql` | `20261023140000` | `ota_hotels` | да |

- Файлов: 8. Записей в `schema_migrations`: 8.
- Пропусков нет. Лишних записей нет. Порядок версий совпадает с порядком файлов.
- Все записи имеют непустые `statements`.

## 2. Фактическая схема `public`

### Таблицы (RLS включён у всех)

| Таблица | Создана в миграции | В базе | RLS |
|---|---|---|---|
| `profiles` | foundation | есть | on |
| `destinations` | foundation | есть | on |
| `hotels` | foundation | есть | on |
| `routes` | routes | есть | on |
| `trips` | trips | есть | on |
| `embeddings` | embeddings | есть | on |
| `geo_buildings` | valencia_geo | есть | on |
| `geo_noise` | valencia_geo | есть | on |
| `ota_hotels` | ota_hotels | есть | on |
| `ota_searches` | ota_hotels | есть | on |

Лишних таблиц в `public` нет.

### Колонки, добавленные ALTER

| Таблица.колонка | Миграция | В базе |
|---|---|---|
| `destinations.position` int | catalog_position | есть |
| `hotels.position` int | catalog_position | есть |
| `hotels.stay_type` text not null default `'hotel'` | catalog_stay_types | есть |
| `hotels.wifi_mbps` int not null default 100 | catalog_stay_types | есть |
| `hotels.workspace` boolean not null default false | catalog_stay_types | есть |

### Функции `public`

| Функция | Миграция | В базе |
|---|---|---|
| `handle_new_user()` | foundation | есть |
| `touch_updated_at()` | trips | есть |
| `match_embeddings(halfvec, text, text[], int)` | embeddings | есть |
| `similar_hotels(text, text[], int)` | embeddings | есть |
| `hotel_geo(double precision, double precision)` | valencia_geo | есть |

### Политики RLS (11 из 11)

| Таблица | Политика | Команда | Роли | Совпадение |
|---|---|---|---|---|
| destinations | destinations_select_all | SELECT | anon, authenticated | да |
| hotels | hotels_select_all | SELECT | anon, authenticated | да |
| ota_hotels | ota_hotels_select_all | SELECT | anon, authenticated | да |
| ota_searches | ota_searches_select_all | SELECT | anon, authenticated | да |
| profiles | profiles_select_own | SELECT | authenticated | да |
| profiles | profiles_update_own | UPDATE | authenticated | да |
| routes | routes_select_all | SELECT | anon, authenticated | да |
| trips | trips_select_own | SELECT | authenticated | да |
| trips | trips_insert_own | INSERT | authenticated | да |
| trips | trips_update_own | UPDATE | authenticated | да |
| trips | trips_delete_own | DELETE | authenticated | да |

### Триггеры

| Таблица | Триггер | Событие | В базе | Совпадение |
|---|---|---|---|---|
| auth.users | on_auth_user_created | AFTER INSERT | есть | да |
| public.trips | trips_touch_updated_at | BEFORE UPDATE | есть | да |

### Расширения

| Расширение | Схема | В базе |
|---|---|---|
| vector | extensions | есть |
| postgis | extensions | есть |

### Индексы

Все индексы из миграций есть: `routes_persona_idx`, `routes_destination_id_idx`, `hotels_destination_id_idx`, `hotels_position_idx`, `trips_user_id_idx`, `embeddings_embedding_idx`, `embeddings_kind_destination_idx`, `geo_buildings_geom_idx`, `geo_noise_geom_idx`, `ota_hotels_ota_hotel_id_key`. Лишних пользовательских индексов нет.

## 3. Итог

- История миграций в базе совпадает с `supabase/migrations/`: 8 из 8, без пропусков и лишних записей.
- Фактическая схема `public` совпадает с миграциями: таблицы, колонки, функции, политики RLS, триггеры, расширения, индексы.
- Расхождений нет. Исправление не требуется. Задача 2.1 закрыта без эскалации.

## 4. Ограничения проверки

- Сверены имена и наличие объектов, а не тела функций и политик построчно.
- Данные таблиц не читались.
