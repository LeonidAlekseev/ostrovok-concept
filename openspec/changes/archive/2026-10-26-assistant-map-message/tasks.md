## 1. OpenSpec

- [x] 1.1 proposal, design, tasks, дельты `assistant-geo` и `assistant-search`

## 2. Гео-ядро

- [x] 2.1 `drivingRoute` (`routed-car`) в `osrm.ts`, инструмент в `tools.ts`
- [x] 2.2 Покрытие дальних категорий загруженной областью точки (`places.ts`)
- [x] 2.3 «До моря» по пляжу (`questions.ts`, описание инструмента)
- [x] 2.4 Один вызов Nominatim за ход (`tools.ts`)
- [x] 2.5 `ChatMap` и `parseChatMap` (`chatMap.ts`)

## 3. Ход Эвала

- [x] 3.1 `geoTurn`: покрытие, план модели или правил, шаги вызовов, маршруты, факты
- [x] 3.2 `hotelTurn` и `hotelAnswer.ts`: факты в ответе модели, ответ правилами, сбои честно, `map` и `steps` в ответе
- [x] 3.3 `TurnStep.agent` `geo`, разбор `map` в `askAssistant`

## 4. Чат

- [x] 4.1 `MessageData.map`, проверка при чтении, ожидающий шаг «Проверяю места рядом с отелем»
- [x] 4.2 `PlacesMap` на MapLibre (Tailwind, © OpenStreetMap), в ленте Эвала и в карточке отеля

## 5. Проверка

- [x] 5.1 Тесты Vitest: маршрут на машине, покрытие, море, Nominatim раз за ход, `geoTurn` с моделью и без, разбор карты, лента
- [x] 5.2 Живая проверка на отеле Валенсии (ota-7484591, 2026-10-26): больница, аптека, бар/клуб, море, центр, аэропорт, место по названию — 1,2–4,4 с; карта в карточке отеля и в чате Эвала, на компьютере и телефоне
- [x] 5.3 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
