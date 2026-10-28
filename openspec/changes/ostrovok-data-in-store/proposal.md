## Why

Данные Островка в базе сохранены полнее, чем сайт и хранилище утверждений их используют: у номеров настоящих отелей Валенсии
нет ни фото, ни удобств, ни площади со страницы Островка; факты страницы и виды из названий номеров не попали в claims; граф
отеля берёт координаты мест из кэша, где часть мест пропала; аэропорт назван именем города; два отеля выглядят одинаково.

## What Changes

- Номера настоящих отелей (`ota-*`) остаются номерами из тарифов, но получают со страницы Островка (`roomGroups` по `rg_hash`)
  фото, удобства и площадь, если в тарифе её нет. Чего нет в данных, не показывается. Удобства — поле `Room.amenities`
  (в `/api/hotels`), на странице отеля и в тарифах.
- `npm run db:features` пишет в claims факты страницы (`hotel.year_built`, `hotel.year_renovated`, `hotel.rooms_count`,
  `hotel.room_floors`, `reported`, правило `ostrovok_fact`) и виды из названий номеров (сущность `room`, `room.view`,
  `reported`, правило `room_name_view`).
- `entities.metadata` (миграция) хранит точку места OSM и места Островка; `GET /api/hotels/{id}/relations` читает её оттуда,
  не из кэша `osm_places_near`.
- Аэропорт Островка хранится в `ota_pois` под своим английским названием, а не под именем города.
- Утверждение Островка о расстоянии до места хранит в `method.straight_m` нашу прямую до точки места.

## Capabilities

### Modified Capabilities
- `hotel-catalog`: номера настоящих отелей со страницы Островка.
- `hotel-knowledge`: факты страницы и виды номеров в claims, точки мест в `entities.metadata`, прямая рядом с расстоянием Островка.

## Impact

`src/lib/ota/{hotel,page}.ts`, `src/lib/catalog.ts`, `src/app/api/hotels/schema.ts`, `RoomList`, `RoomRates`,
`src/lib/claimRows.ts`, `scripts/{hotel-features,load-ota-pages}.ts`, `scripts/lib/claims-store.ts`, `src/lib/db/knowledge.ts`,
миграция `20261028160000_entities_metadata.sql`. После merge: применить миграцию, `db:load:ota-pages` (аэропорт),
`db:rebuild:ota`, `db:features`, `db:embed`.
