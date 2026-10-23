## Why

Travel OS (2026-10-21): постоянные данные — в Supabase (каталог, отзывы, витрина маршрутов, аккаунты, фото), совместная работа — в Liveblocks. Первый шаг — фундамент Supabase: клиенты, схема, загрузка каталога и настоящий вход по почте (85б, 95а, 96а).

## What Changes

- Зависимости `@supabase/supabase-js`, `@supabase/ssr`; dev — `supabase` (CLI) для миграций.
- `supabase/migrations/*`: `profiles` (связь с `auth.users`), `destinations`, `hotels` (ключевые колонки + полный отель в `jsonb`), RLS: каталог читают все, профиль — владелец.
- Скрипт `npm run db:seed`: генератор каталога из `src/lib/catalog.ts` загружает направления и отели в Supabase (upsert, повторный запуск безопасен) и создаёт один демо-аккаунт.
- Вход: Supabase Auth по почте с одноразовой ссылкой (`signInWithOtp`), `/auth/callback`, обновление сессии в `proxy.ts` (Next 16). Регистрация — имя и почта, без пароля. Кнопка «Войти в демо-аккаунт» входит в заранее созданный аккаунт (серверное действие, данные из env).
- Шапка и меню показывают пользователя из сессии Supabase; «Выйти» завершает сессию.
- Каталог в интерфейсе пока читается из кода; перевод чтения на Supabase — отдельный change этого этапа.
- В TODO: админка (кабинет и права администратора — позже).

## Impact

`package.json`, `supabase/`, `scripts/seed.ts`, `src/lib/supabase/*`, `src/proxy.ts`, `src/app/auth/callback/route.ts`, `src/components/Auth/*`, `src/lib/auth.ts`, `Header`, `.env.example`, README. Спеки `auth`, `hotel-catalog`.
