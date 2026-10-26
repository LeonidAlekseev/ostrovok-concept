## Why

Плашка авторства карты показывает длинный перечень источников стиля (OpenFreeMap, OpenMapTiles, OpenStreetMap) и занимает много места на карте. Пользователь просит компактный элемент «© OpenStreetMap» на всех модулях с картами; автосворачивание остаётся прежним.

## What Changes

- Развёрнутая атрибуция показывает только «© OpenStreetMap» — ссылку на https://www.openstreetmap.org/copyright (новая вкладка, `rel="noopener"`). Перечень из стиля убирается: `customAttribution` плюс заглушка свойства `attribution` у источников стиля (они берут его из TileJSON уже после загрузки).
- Вид: белая скруглённая плашка-пилюля в правом нижнем углу, справа чёрная круглая кнопка «i»; свёрнутая — только кнопка «i».
- Автосворачивание (5 секунд или первое взаимодействие) и разворачивание по «i» не меняются.

## Impact

- Спецификация `search-results-page`, требование «Атрибуция карты» (карта окна отеля повторяет её: требование «Отель на карте» в `hotel-page` ссылается на карту `/search`).
- Код: `src/components/SearchResultsPage/mapSetup.ts`, `SearchMap.tsx`, тесты `SearchResultsPage.map.test.tsx`, `searchResultsTestKit.tsx`, `HotelMapDialog.test.tsx`.
