## 1. База

- [x] 1.1 Миграция `20261028130000_hotelier_chat.sql`: таблицы, индексы, `is_hotelier_of`, `is_hotelier`, триггер сообщений, функции прочтения и статуса, RLS, публикация Realtime
- [x] 1.2 Тест RLS `supabase/tests/hotelier_chat_rls.sql`: чужие обращения, отельер без доступа, гость, отправители, закрытое обращение, лимит
- [x] 1.3 `db:push`, `db:types`, `docs:supabase`

## 2. Демо-вход

- [x] 2.1 `signInDemo(next, account)`, кнопка «Демо отельер», секреты `DEMO_HOTELIER_*`
- [x] 2.2 `scripts/hotelier-account.ts` (`npm run db:hotelier`): аккаунт и профиль `all_hotels`

## 3. Чаты

- [x] 3.1 `src/lib/hotelierChat.ts`, `hotelierChatRemote.ts` (чтение, Realtime), `src/lib/db/hotelierChat.ts` (запись)
- [x] 3.2 Маршруты и их описание в OpenAPI
- [x] 3.3 Вкладки «Эвал | Отельер» на странице отеля, `HotelierChat`
- [x] 3.4 Панель `/hotelier`: список, фильтры, переписка, контекст запроса, статусы; ссылка в меню шапки

## 4. Проверка

- [x] 4.1 Тесты: модель чата, запись и отказы базы, маршруты, вкладка чата, панель
- [x] 4.2 Живой прогон в headless Chromium: путешественник пишет, отельер видит и отвечает, ответ приходит без перезагрузки
