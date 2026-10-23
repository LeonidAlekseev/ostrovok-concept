## 1. Данные
- [ ] 1.1 Миграция `ota_hotels`, `ota_searches` (RLS: select всем, запись только service role); применить `npm run db:push`.
- [ ] 1.2 Направление «Валенсия» в `src/data/destinations.ts` (центр 39.4699, -0.3763; фото — первое фото самого высокорейтингового отеля из JSON через CDN).
- [ ] 1.3 `src/lib/ota/` — типы входного JSON (только используемые поля), `ostrovokImage`, маппер в `Hotel` по design.md; юнит-тесты на маппер (звёзды ×10, kind→stayType, цена за ночь, фото {size}, нет rates).
- [ ] 1.4 `scripts/seed-valencia.ts` + `npm run db:seed:valencia -- <path>`: upsert `ota_hotels`, `ota_searches`, `destinations`, `hotels`; печатает счётчики, не ключи. Прогнать на JSON пользователя `/home/agent/.paseo/uploads/upload_8204d170-388c-422b-99b2-a3141aa01cd3/ostrovok_hackthon_valensia_union_data_updated.json` (файл в репо не копировать).
- [ ] 1.5 Если `catalogGenerator`/статический каталог в коде должен знать про Валенсию (поиск по городу, подсказки, падежи «в Валенсии») — добавить.

## 2. UI
- [ ] 2.1 `images.remotePatterns` для `cdn.ostrovok.ru`.
- [ ] 2.2 Поиск «Валенсия» → выдача 221 отель; карта с пинами; страница отеля с реальными фото; 0★ не показывает звёзды.
- [ ] 2.3 Скриншоты (в /tmp, не в репо): выдача Валенсии и страница отеля на 390 и 1440.

## 3. Проверки
- [ ] 3.1 Полный `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run format:check`.
- [ ] 3.2 `npx openspec validate valencia-hotels --strict` → `npx openspec archive valencia-hotels -y` → `npx openspec validate --all --strict`.
