## Why

На странице отеля можно спросить только Эвала, а он знает лишь то, что есть в данных: балкон, сторону окон, этаж, шум у конкретного номера часто не знает никто, кроме отеля. Нужен чат с отельером — человеком, который отвечает лично, — и место, где отельер видит и закрывает обращения. Это первая часть из трёх: база, чаты, демо-вход и Realtime. AI-посредник с инструментом `ask_hotelier` и извлечением характеристик — вторая часть, демо-данные — третья.

## What Changes

- База (миграция `20261028130000_hotelier_chat.sql`, только новые объекты): `hotelier_profiles` (отельер, `is_demo`, `all_hotels`), `hotelier_hotel_access` (отели отельера — задел на несколько отельеров), `hotelier_conversations` (отель, путешественник, тип `user`/`ai_request`, статус `open`/`waiting_hotelier`/`resolved`/`closed`, ссылки на исходный чат Эвала и вызов инструмента, последнее сообщение, непрочитанное обеих сторон), `hotelier_messages` (отправитель `user`/`hotelier`/`ai_assistant`, текст, данные, `shareable`, прочтение), `hotelier_requests` (вопрос, характеристики, номер, статус `pending`/`answered`/`cancelled`/`expired`, ключ дедупликации, исходный вызов, ответ). Индексы по отелю, пользователю, статусу и времени.
- Право отельера — функция `is_hotelier_of(hotel_id)`: профиль с `all_hotels` или строка доступа. Демо-отельер — один профиль с `all_hotels`, без строки на каждый отель. Профили пишет только service role.
- RLS: путешественник видит и пишет только свои обращения и только как `user`; отельер — обращения своих отелей и только как `hotelier`; сообщения `ai_assistant` пишет сервер; гость не видит ничего. Статусы и счётчики меняют только функции `hotelier_conversation_status` и `hotelier_conversation_read`, последнее сообщение и счётчики — триггер; он же не пускает сообщения в закрытое обращение и больше 20 сообщений автора в минуту.
- Realtime: `hotelier_conversations`, `hotelier_messages`, `hotelier_requests` в публикации `supabase_realtime`; подписчик получает только строки своих политик.
- API: `POST /api/hotels/{hotelId}/hotelier/messages` (путешественник пишет отелю), `POST /api/hotelier/conversations/{id}/messages` (ответ отельера), `POST /api/hotelier/conversations/{id}/status`. Сессия пользователя, без service role; валидация длины, лимит запросов по IP.
- Страница отеля: карточка с вкладками «Эвал | Отельер»; истории раздельные, черновики сохраняются при переключении, непрочитанные ответы отельера — счётчик на вкладке.
- Демо-вход: в меню входа рядом с «Войти в демо-аккаунт» — «Демо отельер» (тот же `signInDemo`, пароль только на сервере: `DEMO_HOTELIER_EMAIL`/`DEMO_HOTELIER_PASSWORD`), открывает `/hotelier`. Аккаунт и профиль создаёт `npm run db:hotelier`.
- Панель `/hotelier`: список обращений (отель, последнее сообщение, инициатор, время, статус, непрочитанные), фильтры по статусу, инициатору и отелю, переписка с ответом, контекстом запроса Эвала и характеристиками, «Решено», «Закрыть», «Открыть снова». Гость виден отельеру только как «Гость». В меню шапки отельера — «Панель отельера».

## Capabilities

### New Capabilities

- `hotelier-chat`: чат путешественника с отельером, панель отельера, права, Realtime.

### Modified Capabilities

- `auth`: второй демо-аккаунт «Демо отельер».
- `hotel-page`: карточка помощника с вкладками «Эвал | Отельер».

## Impact

- База: `supabase/migrations/20261028130000_hotelier_chat.sql`, тест RLS `supabase/tests/hotelier_chat_rls.sql`, типы `src/lib/db/database.types.ts`.
- Код: `src/lib/hotelierChat.ts`, `src/lib/hotelierChatRemote.ts`, `src/lib/db/hotelierChat.ts`, маршруты `src/app/api/hotels/[hotelId]/hotelier/messages`, `src/app/api/hotelier/**`, `src/app/hotelier/page.tsx`, `src/components/HotelierChat/*`, `src/components/HotelierPanel/*`, `HotelAssistant.tsx`, `DemoSignIn.tsx`, `src/app/auth/actions.ts`, `Header.tsx`, документ OpenAPI.
- Секреты: `DEMO_HOTELIER_EMAIL`, `DEMO_HOTELIER_PASSWORD` в `.env.local.secret`; скрипт `scripts/hotelier-account.ts` (`npm run db:hotelier`).
