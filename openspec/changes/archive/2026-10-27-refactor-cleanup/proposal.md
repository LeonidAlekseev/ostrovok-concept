## Why

За месяц быстрой работы в коде накопились копии одних и тех же помощников, мёртвые части и неровности API и базы:

- Анонимный клиент Supabase, проверка «настоящий отель» (`ota-<id>`), короткое предупреждение в лог и обёртка «прочитать или `null`» повторены в шести модулях `src/lib/db`.
- Маршруты `/api/hotels/<id>/{view,view-map,noise-map}` — три копии одного кода; заголовок кэша CDN повторён в четырёх маршрутах; ошибки отдаются то по-русски, то по-английски.
- Хуки `useNoiseMap` и `useViewMap` одинаковы; заглушка «Карта недоступна» есть в двух вариантах; `FileReader → data URL` написан дважды; `ui/card.tsx` не используется нигде.
- Девять скриптов `scripts/*.ts` копируют хук разрешения `.ts`, `required()` и создание клиента service role; `build-images.py` всё ещё собирает `orb.webp`, хотя с 23.10 его собирает `build-star-assets.mjs`.
- В базе две функции, которые никто не вызывает (`hotel_view_lines` заменена `hotel_view_eyes`, `similar_hotels` не используется с появления семантического поиска), и полный набор прав anon на `profiles` (включая TRUNCATE), которые не нужны: anon к профилям не обращается.
- `hotel_noise_day` (и вместе с ней `hotel_noise_quiet` и `hotel_geo_features` карты шума) под нагрузкой 8 параллельных запросов отвечает до 5,8 с при лимите anon 3 с: карта шума падает в «нет карты».

## What Changes

- Общие помощники слоя данных в `src/lib/db/anon.ts`: клиент, `isRealHotelId`, `warnShort`, `readOrNull`, `catalogCached`; модули `catalog`, `features`, `hotelDetails`, `noise`, `shares`, `view` переходят на них.
- Общие помощники маршрутов в `src/lib/api.ts`: `CDN_CACHE_HEADERS`, `apiError`, `loadVisibleHotel`; ошибки API — единообразно `{ error }` по-английски (клиент их не показывает).
- Хук `useHotelJson` вместо `useNoiseMap`/`useViewMap`/`useView`; одна заглушка `MapUnavailable` с необязательной подсказкой; `blobToDataUrl` в одном месте; удалён `ui/card.tsx`.
- `scripts/lib/node.ts`: разрешение `.ts`, `required`, `serviceClient`, `readAll`; скрипты используют его. Из `build-images.py` убрана устаревшая сборка `orb.webp`. Ни один скрипт загрузки данных не удалён.
- Миграция: удалить `hotel_view_lines` и `similar_hotels`, отозвать права anon на `profiles`.
- Миграция: готовые карты шума — таблица `hotel_noise_maps` (дневные куски, тишина и ночные контуры по точке отеля и радиусу), функция чтения `hotel_noise_map` для anon и функция пересчёта `hotel_noise_map_refresh` для service role; `npm run db:features` пересчитывает карты. Приложение читает готовую карту одним запросом и, если её нет (новый отель до пересчёта), считает как раньше.
- Комментарии к неочевидным местам; README и спеки — под новые имена.

## Capabilities

### New Capabilities

### Modified Capabilities

- `geo-data`: удалены «Линии взгляда над зданиями» (`hotel_view_lines`); «Высота глаза» без ссылки на неё; добавлены готовые карты шума отелей.

## Impact

- База: две новые миграции; `npm run db:push`, `npm run db:types`, затем `npm run db:features` (заполнение `hotel_noise_maps`).
- Код: `src/lib/db/*`, `src/lib/api.ts`, `src/app/api/**`, `src/components/HotelPage/*`, `src/components/SearchResultsPage/*`, `src/lib/imageOptimize.ts`, `src/lib/assistantChatsRemote.ts`, `scripts/*`, README.
- Поведение для пользователя не меняется, кроме скорости карты шума.
