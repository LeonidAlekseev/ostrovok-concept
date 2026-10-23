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

## Отклонения при реализации
- **Звёзды 0.** `HotelSummary.stars` допускает 0; колонка `hotels.stars` (check 1–5, существующую таблицу не меняем) хранит 1, а сводка каталога читает `stars` из `data`. `hasStars(hotel)` теперь принимает отель и ложен при 0: звёзд и «0-звёздочный» нет, пишется «Отель».
- **Без оценки.** У 112 отелей нет `rating_total`: `rating = 0`, `reviewCount = 0`, без оценок по разделам, отзывов и фото гостей; `isRated(hotel)` скрывает бейдж оценки на карточке, карте, в «Поиске по звёздам», ассистенте и блок оценки на странице отеля.
- **Номера.** В выдаче у каждого отеля один тариф. Номер строится только из тарифа (имя, кровать, площадь, вместимость = `occupancy`); прочие `room_groups` без цены не показываем, чтобы не выдумывать им цену, — они лежат в `ota_hotels.static_vm` и придут с подробными данными. Площадь неизвестна у 46 номеров: `Room.area` может быть `null`, строку номера собирает `roomFacts`.
- **Отмена.** `daysBefore` считается от заезда поиска: он не записан в JSON, а выводится как самый поздний `end_at` политик отмены (2026-11-05), ночей — `amount / average_show_price_per_day` (3). Дни округляются вверх: бесплатная отмена у нас не дольше настоящей.
- **Удобства.** К списку design.md добавлены `has_pool`, `has_spa`, `has_pets`; `has_meal` → «Ресторан».
- **Фото.** Нет `next/image`: фото каталога — `<img>` поверх плашки-заглушки в `PhotoPlaceholder`, поэтому `images.remotePatterns` не нужен и не добавлен. CDN отдаёт формат хранения и игнорирует `?format=webp` (`.jpeg` уже webp, `.JPEG` — jpeg), поэтому параметр не добавляем. Без фото (11 отелей) остаются сгенерированные заглушки. `Photo.url` хранит шаблон с `{size}`: 640x400 для карточек, 1024x768 для галереи и просмотрщика.
- **Направление.** У `Destination` нет поля фото, поэтому фото направления не задаётся. Флаг `real: true` исключает Валенсию из генератора; `priceFrom` = 3600 (самая дешёвая ночь), загрузчик сверяет его с данными. Валенсия — последней в списке направлений, её отели идут после сгенерированного каталога (`position`).
- **Генератор.** `generateHotel(summary, real)` в `catalogGenerator` строит недостающие поля тем же кодом, что и для демо-отелей, а реальные поля перекрывают сгенерированные; в описании нет выдуманного района. `workTraits` экспортирован для Wi‑Fi и рабочего места.
- **Поиск по смыслу.** Векторы отелей Валенсии ещё не посчитаны: `npm run db:embed` упёрся в дневной лимит бесплатных запросов OpenRouter. До повторного запуска семантический поиск их не находит; остальной каталог (выдача, карта, персоны) их видит.
