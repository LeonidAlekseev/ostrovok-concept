## 1. База

- [x] 1.1 Миграция `20261028160000_hotelier_hardening.sql`: `create_hotelier_request` только для service role с проверкой запуска; без вставки в `hotelier_requests`
- [x] 1.2 Права на столбцы без идентификаторов гостя; `hotelier_traveller_chat`, `hotelier_own_answer`, `is_traveller_conversation`
- [x] 1.3 Advisory-блокировка автора в `hotelier_message_added` и `create_hotelier_request`
- [x] 1.4 `knowledge_due_at`, `knowledge_attempts` и заполнение для ждущих ответов

## 2. Сервер

- [x] 2.1 `runAskHotelier` через service role для проверенного пользователя и запуска
- [x] 2.2 Чтения с явными столбцами, свой чат через `hotelier_traveller_chat`, своё сообщение через `hotelier_own_answer`
- [x] 2.3 Аренда, паузы и последняя попытка в `processHotelierAnswer`; `retryDueHotelierKnowledge` после ответов маршрутов; `--force` в скрипте
- [x] 2.4 Отзыв обновляет запуски и шаги чата; `clipText` для текстов моделей

## 3. Браузер

- [x] 3.1 `requestStage`: блок берёт копию, которая дальше; «Отельер отозвал сведения…»

## 4. Проверка

- [x] 4.1 SQL-тесты в транзакции с миграцией; гонка лимита на локальном Postgres; vitest
- [x] 4.2 Живая проверка в headless Chromium без применённой миграции
