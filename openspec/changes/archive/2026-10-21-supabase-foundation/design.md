## Решения пользователя (2026-10-21)

85б: Supabase — постоянный слой (каталог, отзывы, витрина верифицированных маршрутов, аккаунты, Storage для фото); Liveblocks — комнаты поездок (следующие этапы). 95а: каталог переносится в Supabase. 96а: вход по одноразовой ссылке + один демо-аккаунт; админка — в план, проработка позже.

## Окружение

`.env.local` (не в git; пример — `.env.example` без значений):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — браузер и сервер;
- `SUPABASE_SERVICE_ROLE_KEY` — только `scripts/seed.ts`, никогда в клиентский код (`import 'server-only'` там, где читается);
- `SUPABASE_DB_URL` — для `supabase db push`;
- `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` — демо-аккаунт (сервер).
Без переменных сайт собирается и работает как сейчас: вход показывает «Вход временно недоступен», каталог — из кода (CI без секретов должен быть зелёным).

## Схема

- `profiles(id uuid pk references auth.users on delete cascade, name text, created_at)`, триггер создания профиля при регистрации (имя из `raw_user_meta_data`).
- `destinations(id text pk, data jsonb not null, updated_at)`.
- `hotels(id text pk, destination_id text references destinations, stars int, rating numeric, price_from int, lat, lon, data jsonb not null, updated_at)`, индексы по `destination_id`.
- RLS включён везде; `select` для `anon` и `authenticated` на каталоге; запись — только service role. `profiles`: select/update своего.
- Миграции применяются `npx supabase db push --db-url "$SUPABASE_DB_URL"` (скрипт `npm run db:push`).

## Загрузка

`scripts/seed.ts` (запуск через `node --experimental-strip-types` или `tsx`, без новой зависимости, если Node 26 исполняет TS): строит каталог тем же кодом, upsert пачками по 100, печатает число строк. Создаёт демо-пользователя через `auth.admin.createUser` (email подтверждён, имя «Демо-путешественник»), если его нет.

## Вход

- Клиенты: `src/lib/supabase/server.ts` (`createServerClient` с cookies), `client.ts` (`createBrowserClient`), `proxy.ts` — обновление сессии (см. гайд Next 16 про `proxy` и `@supabase/ssr`).
- Форма «Вход»: почта → «Отправить ссылку», затем «Проверьте почту». «Регистрация»: имя + почта + согласие → ссылка (имя в `options.data`). Пароли из форм убраны; валидация почты и имени остаётся.
- «Войти в демо-аккаунт» — серверное действие `signInWithPassword` с `DEMO_USER_*`; заметная вторичная кнопка в окне входа.
- `next` после входа — прежние правила (внутренний путь).
- Избранное и брони пока остаются в браузере (перенос — позже).

## Проверка

Юнит-тесты с моком клиента Supabase; живая проверка — при наличии ключей в `.env.local`: `db:push`, `db:seed`, вход в демо-аккаунт на dev-сервере. Секреты не логировать и не коммитить.
