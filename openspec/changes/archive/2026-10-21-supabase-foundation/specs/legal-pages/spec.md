## MODIFIED Requirements

### Requirement: Описание хранилища
Страница `/legal/cookies` SHALL перечислять cookie сессии входа и ключи `localStorage`, которые использует прототип, и их назначение и сообщать, что сторонних cookie и аналитики нет.

#### Scenario: Ключи хранилища
- **WHEN** пользователь открывает `/legal/cookies`
- **THEN** перечислены `sb-<проект>-auth-token`, `ostrovok:v1:favorites` и `ostrovok:v1:bookings`
