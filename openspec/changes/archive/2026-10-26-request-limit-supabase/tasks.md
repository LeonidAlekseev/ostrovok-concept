## 1. Лимит

- [x] 1.1 `allowRequest` через `rate_limit_hit` (как `allowVisionRequest`), ключ `request:` + sha256 IP; запасной счётчик в памяти
- [x] 1.2 `route.ts`: асинхронная проверка лимита до разбора запроса; ответ 429 прежний

## 2. Проверка

- [x] 2.1 Тесты: общий лимит в Supabase; сбой/таймаут — память; 21-й запрос — 429
- [x] 2.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
