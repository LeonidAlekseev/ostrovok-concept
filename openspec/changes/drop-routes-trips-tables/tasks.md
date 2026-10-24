## 1. Подготовка
- [x] 1.1 Убедиться, что `check-migration-history` слит и расхождений нет
- [x] 1.2 Поиском по репозиторию подтвердить, что `routes`, `trips`, `touch_updated_at` и `kind = 'route'` не используются кодом приложения
- [x] 1.3 Выгрузить строки `routes`, `trips` и `embeddings` вида `route` в файл вне репозитория; записать путь и число строк в отчёт

## 2. Миграция
- [x] 2.1 Новая миграция: удалить `trips` (и триггер), `routes`, лишнюю `touch_updated_at`, векторы `route`, сузить `kind`
- [x] 2.2 Убрать упоминания маршрутов и планов из `scripts/`
- [ ] 2.3 `npm run db:push`; проверить, что таблиц нет, а `match_embeddings` и `similar_hotels` работают

## 3. Проверка
- [x] 3.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
- [ ] 3.2 Вручную: `/search`, страница отеля, вход по ссылке, `/trips` (бронирования) без ошибок
