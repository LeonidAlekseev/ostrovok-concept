## 1. OpenSpec

- [ ] 1.1 proposal, design, tasks, дельты `assistant-geo` и `assistant-search`

## 2. Гео-ядро

- [ ] 2.1 `drivingRoute` (`routed-car`) в `osrm.ts`, инструмент в `tools.ts`
- [ ] 2.2 Покрытие дальних категорий загруженной областью точки (`places.ts`)
- [ ] 2.3 «До моря» по пляжу (`questions.ts`, описание инструмента)
- [ ] 2.4 Один вызов Nominatim за ход (`tools.ts`)
- [ ] 2.5 `ChatMap` и `parseChatMap` (`chatMap.ts`)

## 3. Ход Эвала

- [ ] 3.1 `geoTurn`: покрытие, план модели или правил, шаги вызовов, маршруты, факты
- [ ] 3.2 `hotelTurn` и `hotelAnswer.ts`: факты в ответе модели, ответ правилами, сбои честно, `map` и `steps` в ответе
- [ ] 3.3 `TurnStep.agent` `geo`, разбор `map` в `askAssistant`

## 4. Чат

- [ ] 4.1 `MessageData.map`, проверка при чтении, ожидающий шаг «Проверяю места рядом с отелем»
- [ ] 4.2 `PlacesMap` на MapLibre (Tailwind, © OpenStreetMap), в ленте Эвала и в карточке отеля

## 5. Проверка

- [ ] 5.1 Тесты Vitest: маршрут на машине, покрытие, море, Nominatim раз за ход, `geoTurn` с моделью и без, разбор карты, лента
- [ ] 5.2 Живая проверка на отеле Валенсии: больница, аптека, бар/клуб, море, центр, аэропорт
- [ ] 5.3 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
