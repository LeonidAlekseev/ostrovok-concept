## 1. Лимит

- [ ] 1.1 `allowRequest` через `rate_limit_hit` (как `allowVisionRequest`), ключ `request:` + sha256 IP; запасной счётчик в памяти
- [ ] 1.2 `route.ts`: асинхронная проверка лимита до разбора запроса; ответ 429 прежний

## 2. Проверка

- [ ] 2.1 Тесты: общий лимит в Supabase; сбой/таймаут — память; 21-й запрос — 429
- [ ] 2.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
