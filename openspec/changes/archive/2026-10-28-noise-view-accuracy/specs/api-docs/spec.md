## MODIFIED Requirements

### Requirement: Расчёт шума в документации
`/api/docs` SHALL описывать оценку шума у фасада noise-estimate-v2 в описаниях `GET /api/hotels/{hotelId}/claims` и `GET /api/hotels/{hotelId}/noise-map`: свойства `noise.estimate.*`, формулы, таблицу опорных уровней заведений, источники EEA, уверенность и ограничения — из тех же констант, что считает оценку. Примеры ответов `noise-map` и `claims` (в том числе `noise.estimate.street.` для ota-9741622) SHALL быть сняты с работающего сайта.

#### Scenario: Пример оценки
- **WHEN** разработчик открывает примеры ответа `getHotelClaims`
- **THEN** среди них пример ota-9741622 с `noise.estimate.street.lday` 65,2–73,2 дБ и его расчётом `noise-estimate-v2`

