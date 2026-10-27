## 1. Анализ

- [x] 1.1 Граф: функции и модули без входящих связей, пары похожих функций; проверка grep динамических импортов и скриптов
- [x] 1.2 База: функции без вызовов в приложении и скриптах, права, RLS, индексы; замер `hotel_noise_day` до

## 2. Код приложения

- [x] 2.1 `src/lib/db/anon.ts` и переход модулей `src/lib/db`
- [x] 2.2 `src/lib/api.ts` и маршруты `src/app/api`
- [x] 2.3 `useHotelJson`, `MapUnavailable`, `blobToDataUrl`, удаление `ui/card.tsx`

## 3. Скрипты

- [x] 3.1 `scripts/lib/node.ts` и переход скриптов; `build-images.py` без `orb.webp`
- [x] 3.2 Список скриптов с назначением; npm-скрипты

## 4. База

- [x] 4.1 Миграция: удалить `hotel_view_lines`, `similar_hotels`; отозвать права anon на `profiles`
- [x] 4.2 Миграция: `hotel_noise_maps`, `hotel_noise_map`, `hotel_noise_map_refresh`, `hotel_noise_maps_prune`
- [x] 4.3 `db:push`, `db:types`, заполнение через `db:features`; приложение читает готовую карту
- [x] 4.4 Замер после (однопоточно и под нагрузкой)

## 5. Проверка

- [x] 5.1 Тесты на новые помощники и чтение готовой карты
- [x] 5.2 README, спеки
- [x] 5.3 lint, typecheck, test, format:check, openspec validate; страницы на 375 и 1280 px
