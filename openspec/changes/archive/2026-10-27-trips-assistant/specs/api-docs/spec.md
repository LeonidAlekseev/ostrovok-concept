## ADDED Requirements

### Requirement: Чат о бронированиях в документе OpenAPI
Схема `POST /api/assistant` SHALL описывать брони запроса (`bookings`, компонент `TripBooking` без личных полей), поля брифа `trips` и `bookingId`, агента шага `trips` и предложение смены дат `change` (компонент `DateChange`); пример переноса брони — живой ответ маршрута — SHALL проходить проверку по схеме.

#### Scenario: Пример переноса брони
- **WHEN** тест документа проверяет примеры
- **THEN** запрос с `brief.trips` и `bookings` и ответ с шагом «Пересчёт при смене дат» и `change` соответствуют схеме
