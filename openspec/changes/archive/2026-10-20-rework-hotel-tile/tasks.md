# Tasks

## 1. Данные

- [x] 1.1 Родительный падеж городов в `src/data/destinations.ts`; проверка: unit-тест — у каждого направления непустой `genitive`.
- [x] 1.2 `guruPrice` и `hasFreeCancellation`; проверка: unit-тесты (5 985 → 5 387; отель без бесплатной отмены → false).

## 2. Карточка

- [x] 2.1 `PhotoCarousel`: свайп, стрелки при наведении, счётчик; проверка: component-тест — «Следующее фото» меняет счётчик на «2 / N».
- [x] 2.2 `HotelTile` по макету: метки на фото, строка расстояния, две цены и логотип GURU, без «от»; проверка: component-тест состава.
- [x] 2.3 Отмена: в поиске по тарифу, в остальных местах по отелю; проверка: component-тесты `ResultTile` и подборки.
- [x] 2.4 Убрать питание и число отзывов из `ResultTile`; проверка: тесты `/search`.
- [x] 2.5 Кадры 360, 768, 1280, 1536 px главной, `/search`, `/favorites` в `/tmp/rework-hotel-tile-screenshots`; ничего не переносится некрасиво и не обрезается.

## 3. Итог

- [x] 3.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` проходят.
