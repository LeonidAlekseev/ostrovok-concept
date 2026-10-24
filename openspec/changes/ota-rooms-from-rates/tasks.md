## 1. Номера
- [ ] 1.1 Номера `ota-*` только из тарифов; убрать номера из `room_groups`, `capacity: 0` и пометку «Нет цены на выбранные даты»; тесты
- [ ] 1.2 `hotel-features.ts` / `hotel_room_views`: вид из `room_groups` с группировкой по `room_group_id`, «по описанию»; формулировки Эвала без обещания конкретного номера

## 2. Данные (пользователь)
- [ ] 2.1 `db:rebuild:ota -- --dry-run` (исполнитель) → команды для пользователя: `db:rebuild:ota`, `db:features`, `db:embed`
- [ ] 2.2 После записи — проверка чтением: номеров у `ota-*` = числу тарифов, отзывов 0

## 3. Проверка
- [ ] 3.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
