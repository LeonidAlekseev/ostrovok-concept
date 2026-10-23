## Источник
JSON: `hotels[]` (221) — полный объект отеля: `static_vm`, `rates`, `marketing_badges`; `map_hotels[]` (221, те же `master_id`) — пины карты: `latitude/longitude`, `price` (₽ за весь запрошенный срок), `stars` (×10: 40 = 4★), `rating`, `image.tmpl`. Уникальность: `master_id` (число) и `ota_hotel_id` (строка).

## Маппинг в `Hotel`
- `id` = `ota-<master_id>`, `destinationId` = `valencia`, `name` = `static_vm.name`, `address`, `lat/lon` = `static_vm.latitude/longitude`.
- `stars` = `round(star_rating / 10)` (0 — отель без звёзд), `rating` = `rating_total` (из 10).
- `stayType`: `static_vm.kind` → Hostel→hostel; Aparthotel, Cottages_and_Houses→apartments; Villas_and_Bungalows→villa; остальное→hotel. Если в схеме `stars` обязателен 1–5, для 0 звёзд брать 1 только в колонке, а в `data` хранить настоящий 0 — исполнитель проверяет, как UI показывает 0 (не показывать звёзды).
- `priceFrom`: из `rates[0].payment_options.payment_types[0].average_show_price_per_day` (₽ за ночь), округлить `roundUp100`; нет rates → `map_hotels.price` / число ночей запроса.
- `photos`: все `static_vm.images[]`, `src` = `tmpl.replace('{size}', '1024x768')`, превью `640x400`.
- `metro`: ближайшая из `nearest_subways` (имя, метры → км).
- `amenities`: из `serp_filters` (has_internet→Wi‑Fi, has_parking→Парковка, has_fitness→Фитнес, has_meal→Питание, has_kids→Для детей, has_airport_transfer→Трансфер, has_disabled_support→Доступная среда, air-conditioning→Кондиционер) в порядке `AMENITIES`; неизвестные — пропустить.
- `rooms`: из `room_groups[].name_struct.main_name` + bedding; тарифы — из `rates` (цена/ночь, отмена из `cancellation_penalties`, питание если есть); если тарифов для группы нет — один тариф по `priceFrom`.
- Чего в JSON нет (`description`, `sectionScores`, `reviews`, `guestPhotos`, время заезда): существующий генератор каталога даёт детерминированные значения по seed `id` — переиспользовать его функции, а не выдумывать вторую логику. Отзывы: `reviewCount` = `rating.count`.
- `distanceKm` = `search_region_center_distance`.

## Хранение
`ota_hotels(master_id bigint pk, ota_hotel_id text unique not null, name text, lat, lon, static_vm jsonb, map_hotel jsonb, rates jsonb, marketing_badges jsonb, updated_at)`; `ota_searches(id text pk, region_slug text, payload jsonb, updated_at)` — всё кроме `hotels`/`map_hotels`. Поздние «данные на каждый отель» лягут в новую колонку/таблицу по `master_id`.

## Карта и фото
`next.config` `images.remotePatterns`: `https://cdn.ostrovok.ru/t/**`. Если `next/image` не используется для фото каталога — просто подставлять URL. Вспомогательная `ostrovokImage(tmpl, size)`.

## Геоданные
`public.hotel_geo(lat, lon)` (здания, шум Валенсии) уже есть в БД; вывод на странице отеля — отдельное change, здесь не делаем.
