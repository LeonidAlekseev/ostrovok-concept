## 1. Эвал

- [x] 1.1 `parseBudget`: пробел склеивает только группы по три цифры
- [x] 1.2 `placeQuery`: вопрос об этаже — не название места
- [x] 1.3 Реплика разбора пожелания без вопросов
- [x] 1.4 `outsideData`: слово латиницей и совет вне данных — отказ модели
- [x] 1.5 `roomLabel`: «(no window)» → «(без окна)»
- [x] 1.6 `model` в ответе `POST /api/assistant`
- [x] 1.7 `osm_places_named`: слова названия целиком, «ТЦ» предпочитает `shop=mall`

## 2. Отельер

- [x] 2.1 `needsHotelier`: трансфер из аэропорта, балкон с видом на море
- [x] 2.2 `hotelier_traveller_chat` без скрытых чатов
- [x] 2.3 «Мои чаты»: Realtime и порядок на телефоне
- [x] 2.4 Адрес страницы Островка: `ota_hotel_pages.url`, ссылка источников
- [x] 2.5 Vercel Cron для `knowledge/retry`, `CRON_SECRET`

## 3. Данные и API

- [x] 3.1 `hotel_features.noise_facade` и чтение шума оттуда
- [x] 3.2 `/health` в OpenAPI
- [x] 3.3 Комментарий миграции эмбеддингов
