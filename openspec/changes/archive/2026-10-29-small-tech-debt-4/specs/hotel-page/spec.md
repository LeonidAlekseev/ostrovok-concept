## ADDED Requirements

### Requirement: Шум фасада из сохранённой строки
Полосы EEA у фасада отеля для страницы и Эвала SHALL читаться из сохранённого ответа `hotel_noise_facade` в `hotel_features.noise_facade` (его пишет `npm run db:features`), а не вызовом функции на каждый запрос. Отель без сохранённой строки SHALL читаться вызовом функции, при отмене по `statement_timeout` — повторным. Цифры страницы и Эвала SHALL быть теми же.

#### Scenario: Строка есть
- **WHEN** у отеля в `hotel_features` есть `noise_facade`
- **THEN** `hotel_noise_facade` не вызывается, полосы те же, что дал бы вызов

#### Scenario: Строки нет
- **WHEN** у отеля нет `noise_facade`
- **THEN** полосы читаются вызовом `hotel_noise_facade`
