## 1. Интерфейс

- [x] 1.1 `Badge` `destructive` — контраст ≥ 4,5:1; проверить места использования
- [x] 1.2 `HotelTile`: «Апарт…» на узкой карточке, строка расстояния в одну строку
- [x] 1.3 Список чатов: название с многоточием в конце, время справа не вытесняет его
- [x] 1.4 Быстрые ответы темы: «В город», «Куда угодно»; разбор «удиви меня» и «куда угодно» — тема на выбор Эвала

## 2. Чистка

- [x] 2.1 Удалить `glassPanel` и связанное в `glass.ts`, если не используется; мёртвые `--decor-assistant-*`; мёртвые `max-sm:*` в `HotelDialog.tsx`
- [x] 2.2 README: цепочки моделей и `embed-1b`
- [x] 2.3 `vision.ts`: `file` с `mediaType` вместо `image`
- [x] 2.4 `weekday`: кеш форматтера

## 3. Тесты и типы

- [x] 3.1 Разбить `SearchResultsPage.test.tsx`; тест «opens the hotel page instead of the dialog… on narrow screens» — `waitFor`
- [x] 3.2 `catalog.ts`: `overrideTypes` вместо `.returns<>`, мок в `catalog.test.ts`
- [x] 3.3 `tsconfig.scripts.json` и проверка `scripts/` в `npm run typecheck`

## 4. Лента Эвала

- [x] 4.1 Отели планов чата — общий запрос или кеш; при сбое загрузки — повтор, без упрощённой карточки навсегда

## 5. Проверка

- [x] 5.1 Браузер 390 и 1440 px: карточка апартаментов, список чатов с длинным названием, быстрые ответы темы
- [x] 5.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
