## 1. Поиск мест

- [x] 1.1 Миграция `osm_places_fuzzy_name`: `unaccent` + `pg_trgm`, равное имя главнее похожих; проверена в `begin … rollback` на живой БД
- [x] 1.2 Словарь русских названий `ruPlaces.ts`, `geocode` через него; тесты
- [x] 1.3 `placeAfterTo`: название после «до» в `geocode` (правила и `tidyPlan`); тесты
- [x] 1.4 Запасной сервер Overpass, отдельный интервал в `RateGate`; тесты

## 2. Вопросы об отеле

- [x] 2.1 Смешанный вопрос: ответ гео-шагов плюс ответ по данным отеля; тест
- [x] 2.2 Отдельный лимит `HOTEL_RATE_LIMIT`; тесты
- [x] 2.3 Слова правил `hotelAnswer.ts` по началу слова; тест
- [x] 2.4 Карточка Эвала без кадра с черновиком

## 3. Проверки

- [x] 3.1 lint, typecheck, vitest, format:check, openspec validate, build
