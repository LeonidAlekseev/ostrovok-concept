## Why

После `hotelier-chat` (#356–#358) остались пять дыр: путешественник может сам вызвать `create_hotelier_request`, и его вопрос выглядит как запрос Эвала; отельер получает `user_id` гостя в данных API и Realtime; лимит 20 сообщений в минуту обходится параллельными вставками; извлечение характеристик после сбоя или обрыва `after()` ждёт ручного `npm run db:hotelier-knowledge`; отзыв сведений не меняет уже показанные блоки «Запрос отельеру», а тексты обрезаются посреди слова.

## What Changes

- **BREAKING** (контракт базы): `create_hotelier_request` вызывает только сервер (service role) для пользователя, которого проверила сессия, и только для идущего запуска `ask_hotelier` в его чате; прямая вставка в `hotelier_requests` запрещена.
- Столбцы, по которым можно узнать гостя (`user_id`, `origin_chat_id`, `origin_tool_run_id`, `author_id`), и служебные столбцы извлечения не выбираются ролью `authenticated` — ни через API, ни через Realtime. Свой чат с отелем путешественник находит функцией `hotelier_traveller_chat`, своё ли это сообщение, отельер узнаёт функцией `hotelier_own_answer`.
- Лимиты сообщений и запросов строгие: записи одного автора идут по очереди за advisory-блокировкой транзакции.
- Ответ, который можно взять в общие сведения, сразу «к обработке» (`knowledge_due_at`); сервер берёт его в аренду, неудачную попытку повторяет с паузой 1, 4, 16, 64 минуты (до 5 попыток) после ответов маршрутов, которые читают сведения.
- Отзыв сведений обновляет блоки «Запрос отельеру»: «Отельер отозвал сведения…», без характеристик, — сразу и после перезагрузки.
- Тексты моделей и вопросы обрезаются по слову с «…» (`clipText`), а не посреди слова.

## Capabilities

### New Capabilities

### Modified Capabilities

- `hotelier-chat`: строгий лимит сообщений; идентификатор гостя скрыт от отельера.
- `hotelier-knowledge`: запрос отельеру только от сервера; строгие лимиты запросов; автоматический повтор извлечения; отзыв в блоке «Запрос отельеру»; тексты без обрывков слов.

## Impact

- Миграция `supabase/migrations/20261028160000_hotelier_hardening.sql`; тесты `supabase/tests/hotelier_chat_rls.sql`, `hotelier_requests.sql`, `hotelier_rate_race.sh`.
- `src/lib/ai/hotelierTool.ts`, `src/app/api/assistant/route.ts`, `src/lib/hotelierChat.ts`, `src/lib/hotelierChatRemote.ts`, `src/lib/db/hotelierChat.ts`, `src/lib/db/hotelierKnowledge.ts`, маршруты `hotelier`, `useLiveRun`, `ChatCards`, `assistantChats`, `format.ts`, `database.types.ts`, `supabase.gen.json`.
- Поиск (`hotel_chunks_hybrid`) не меняется.
