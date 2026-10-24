## Why
Решение пользователя 2026-10-24: вместо OpenRouter ходить к моделям NVIDIA напрямую через API NVIDIA (build.nvidia.com): лимит 40 запросов в минуту и без дневного лимита, тогда как бесплатные модели OpenRouter ограничены 50 запросами в день и в проде часто работает запасной путь без модели. Ключ у пользователя есть, хранится как `NVIDIA_API_KEY` в `.env.local.secret` (git-secret).

## What Changes
- **Ключ:** `NVIDIA_API_KEY` через `getSecret` (`src/lib/secrets.ts`); имя — в `.env.example`. `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` убираются из кода и `.env.example`, когда больше не нужны.
- **Модели** (решение пользователя 2026-10-24), OpenAI-совместимый API NVIDIA `https://integrate.api.nvidia.com/v1` с ключом `NVIDIA_API_KEY`:
  - лёгкие текстовые задачи (понимание пожелания и ответы помощника, `src/lib/ai/model.ts`, `understand.ts`) — `nvidia/nemotron-3.5-lightning-30b-a3b`;
  - эмбеддинги текста и документов с фото — `nemotron-3.5-embed-8b` (`src/lib/ai/embedding.ts`), размерность остаётся 2048 (усечение запросом или на клиенте), `input_type` query/passage;
  - реранк текста и документов с фото — `nemotron-3.5-rerank-8b` (`src/lib/ai/rerank.ts`, эндпоинт `https://ai.api.nvidia.com/v1/retrieval/nvidia/nemotron-3.5-rerank-8b/reranking`), адаптер `RerankingModelV4` сохраняется;
  - сложные мультимодальные задачи — `nvidia/nemotron-3.5-super-vl-120b-a12b`; сейчас таких задач в коде нет, модель подключается тем change, где появится первая такая задача (не заводить заранее).
  Пример пользователя — пакет `openai` с `baseURL`; в проекте ИИ-слой на Vercel AI SDK, поэтому используется OpenAI-совместимый провайдер AI SDK с тем же `baseURL` (`@ai-sdk/openai-compatible`, если нужен новый пакет — одна зависимость). Пакет `openai` не добавляется, если провайдер AI SDK покрывает задачу.
- **Лимит 40 rpm:** клиент уважает лимит (очередь/повтор с ожиданием при 429 в скриптах `db:embed` и `semantic-eval`), приложение по-прежнему уходит в запасной путь при ошибке или таймауте.
- **Векторы:** если векторы NVIDIA совпадают с текущими (тот же текст, косинус ≥ 0,99 на выборке), пересчёт не нужен; иначе — `npm run db:embed` (выполняет пользователь или исполнитель по разрешению).
- README: раздел про модели и ключи.

## Impact
- `src/lib/ai/{model,understand,embedding,rerank,semantic}.ts`, `scripts/{embed,semantic-eval}.ts`, `.env.example`, README, тесты; возможно `package.json` (провайдер AI SDK, если нужен `@ai-sdk/openai-compatible`). Spec `semantic-search`.
- Высокий риск: внешний API, ключи, ИИ-слой.
- До `rename-cozy-evening` (его `db:embed` не должен упираться в дневной лимит OpenRouter) и до `assistant-chat-redesign`.
