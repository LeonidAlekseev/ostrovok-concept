## ADDED Requirements

### Requirement: Проверка `/health` в документе
`GET /health` SHALL быть описан в `/api/openapi.json` (тег «Служебные», ответ `{ status: "ok" }`, заголовок `Cache-Control: no-store`), хотя лежит вне `src/app/api`. Тест документа SHALL проверять его наравне с маршрутами `src/app/api`.

#### Scenario: Документ
- **WHEN** разработчик открывает `/api/openapi.json`
- **THEN** в путях есть `/health` с ответом 200 и примером `{ status: "ok" }`
