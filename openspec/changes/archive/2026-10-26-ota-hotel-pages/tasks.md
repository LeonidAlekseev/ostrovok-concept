## 1. Данные

- [x] 1.1 Исследование снимков: структура `__NEXT_DATA__`, размеры частей, места, отзывы, источники, правила, факты
- [x] 1.2 Миграция: `ota_hotel_pages`, `ota_pois` (PostGIS, GIST), `ota_hotel_pois`, `ota_rate_spec_tags`, `ota_hotel_places`, `hotels.wifi_mbps` без `not null`
- [x] 1.3 `scripts/load-ota-pages.ts` и `npm run db:load:ota-pages`: проверка файлов, обрезка без контактов, загрузка
- [x] 1.4 `npm run db:push`, загрузка 221 страницы, `npm run db:types`, размер базы

## 2. Каталог

- [x] 2.1 `src/lib/ota/page.ts`: разбор страницы в `HotelDetails` и поля строки каталога
- [x] 2.2 `otaHotel` и `npm run db:rebuild:ota`: описание, время, рабочая зона со страницы, Wi‑Fi `null`
- [x] 2.3 `wifiMbps: number | null` в фильтрах, подборках, документах и ответах Эвала

## 3. Страница отеля

- [x] 3.1 `loadHotelDetails`, `GET /api/hotels/<id>/details`, детали в окне отеля на `/search`
- [x] 3.2 Описание по частям, факты (этажи номеров отдельно от EUBUCCO), удобства по группам
- [x] 3.3 Оценки по источникам, отзывы с источником, «Вид в отзывах гостей»
- [x] 3.4 «Что рядом» в разделе и в боковой карточке; правила, сборы и примечания; без контактов

## 4. Эвал и поиск

- [x] 4.1 `hotelFacts` и `ruleAnswer` по данным страницы, места рядом
- [x] 4.2 Места и удобства в тексте поиска по смыслу, `npm run db:embed`

## 5. Проверка

- [x] 5.1 Тесты разбора, страницы и Эвала
- [x] 5.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
- [x] 5.3 Отчёт о расхождениях этажности Островка и EUBUCCO
