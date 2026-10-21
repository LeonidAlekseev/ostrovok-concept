## Why

Travel OS (2026-10-21, решение 86б): «AI»-части (чат помощника, сборка маршрутов, астро, демо-маршруты) работают на языковой модели через Vercel AI SDK и провайдер OpenRouter, бесплатная модель `minimax/minimax-m3.1-flash:free`. Первый шаг — серверный слой модели и чат помощника.

## What Changes

- Зависимости `ai` (v7), `@openrouter/ai-sdk-provider`, `zod` (если не тянется транзитивно).
- `src/lib/ai/model.ts` (только сервер): `createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })`, модель из `OPENROUTER_MODEL` (по умолчанию `minimax/minimax-m3.1-flash:free`).
- Маршрут `POST /api/assistant`: принимает историю чата и уже понятое, возвращает структурированное понятое (`generateObject`/`Output.object` по схеме zod: город каталога, тема, состав, настроение, когда, ночи, бюджет) и короткий ответ. Город — только из каталога (список в системной подсказке и проверка после ответа).
- Помощник на главной вызывает маршрут; при отсутствии ключа, ошибке, лимите или таймауте 8 с — прежний разбор на правилах, без видимой ошибки для пользователя.
- Ограничения: длина сообщения 500 символов, не больше 20 сообщений истории, простое ограничение частоты по IP в памяти процесса.

## Impact

`package.json`, `src/lib/ai/*`, `src/app/api/assistant/route.ts`, `src/components/SearchPanel/AssistantSearch.tsx`, `src/lib/assistant.ts` (точка расширения), `.env.example`, тесты. Спека `assistant-search`.
