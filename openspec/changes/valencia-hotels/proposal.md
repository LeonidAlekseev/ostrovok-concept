## Why
Пользователь прислал реальную выдачу Островка по Валенсии: `ostrovok_hackthon_valensia_union_data_updated.json` (221 отель). Валенсия должна появиться в каталоге как новый город рядом с прежними, с настоящими фото, координатами, звёздами, рейтингом и ценой. Позже придут подробные данные по каждому отелю, поэтому исходный JSON сохраняем в БД целиком.

## What Changes
- Новое направление «Валенсия» (`valencia`, Испания) в `src/data/destinations.ts`.
- Таблица `public.ota_hotels`: сырые данные Островка по отелю. Ключ `master_id`, уникальный `ota_hotel_id`, в jsonb лежат `static_vm`, `map_hotel` и `rates`, плюс `updated_at`. Отдельная таблица `public.ota_searches` хранит метаданные выдачи: `available_filter_params`, `total_*`.
- Маппер «OTA → `Hotel`» (`src/lib/ota/`) и загрузчик `npm run db:seed:valencia -- <json>`. Загрузчик кладёт сырые строки в `ota_hotels` и готовые отели в `public.hotels`, с идентификатором `ota-<master_id>` и `destination_id = 'valencia'`.
- Фото берутся с CDN Островка: в шаблоне `{size}` заменяется на размер, `640x400` для карточек и `1024x768` для галереи. Хост `cdn.ostrovok.ru` добавляется в `images.remotePatterns`.
- Отели Валенсии видны везде, где виден каталог: в поиске, выдаче, на карте и в персонах.

## Impact
- Миграция: `ota_hotels`, `ota_searches`. Ограничения RLS как у каталога: все читают, пишет только service role.
- Spec `hotel-catalog`: добавляется требование про реальные отели Валенсии.
