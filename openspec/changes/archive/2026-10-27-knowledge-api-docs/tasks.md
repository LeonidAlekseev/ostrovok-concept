## 1. Чтение

- [x] 1.1 `src/lib/db/knowledge.ts`: связи отеля с утверждением, источником, координатами и категориями из кэша OSM

## 2. Маршруты

- [x] 2.1 `claims`: схема, маршрут, лимит и `truncated`
- [x] 2.2 `documents/search`: схема, маршрут, источники фрагментов, ограничение стеммера в описании
- [x] 2.3 `relations`: схема, маршрут, фильтры predicate и category

## 3. Документация

- [x] 3.1 Операции в реестре, тег, примеры (`npm run docs:examples`), `docs:supabase`
- [x] 3.2 Карта мест для `relations` на `/api/docs`

## 4. Проверки

- [x] 4.1 Тесты разбора, 404, фильтров, ограничений; db-тест `LIVE_DB=1`
- [x] 4.2 lint, typecheck, test, format:check, openspec validate, build; страница и маршруты вживую
