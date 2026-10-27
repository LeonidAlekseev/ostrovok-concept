## 1. База

- [x] 1.1 Миграция `hotel_noise_day` (куски Lden×Lnight одного слоя), `npm run db:push`, `npm run db:types`

## 2. Данные

- [x] 2.1 `dayEstimate`: точная нижняя граница, ночь «ниже 40», открытая сверху Lden; `dayLabel` «от N дБ», `dayColorLevel`
- [x] 2.2 `noiseMapOf`: куски дня с оценкой и `level`, Lnight, тишина Lden как дневная; без Lden
- [x] 2.3 `noiseLines`: день, ночь, сутки

## 3. Страница

- [x] 3.1 Переключатель «Днём»/«Ночью» (по умолчанию «Днём»), легенда с подписью оценки и серым для кусков без оценки
- [x] 3.2 Проверка на отелях Валенсии: оценка между ночью и верхом, число отелей и кусков без оценки, время и размер ответа
- [x] 3.3 Визуальная проверка на 375 и 1280 px, снимки вне репозитория

## 4. Проверка

- [x] 4.1 Тесты `noise`, `db/noise`, `NoiseMap`, `HotelNoise`
- [x] 4.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npx openspec validate --all --strict`
