## ADDED Requirements

### Requirement: Права на столбцы чата отельера
Права `select` роли `authenticated` на столбцы таблиц `hotelier_conversations`, `hotelier_requests`, `hotelier_messages` SHALL выдавать функция `refresh_hotelier_column_grants()`: все столбцы, кроме скрытых. Миграция, добавляющая столбец, SHALL заканчиваться её вызовом. Функция SHALL быть недоступна `anon` и `authenticated`.

#### Scenario: Новый столбец
- **WHEN** миграция добавила столбец и вызвала функцию
- **THEN** браузер и Realtime читают столбец, а скрытые остаются скрытыми
