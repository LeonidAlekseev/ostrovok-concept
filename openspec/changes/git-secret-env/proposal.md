## Why

Пользователь 2026-10-21: ключи API (Supabase, OpenRouter, позже Liveblocks) хранить в репозитории зашифрованными через git-secret (https://github.com/sobolevn/git-secret), чтобы в Vercel один раз добавить один ключ, а код брал все остальные ключи из зашифрованного файла.

## What Changes

- `.gitignore`: `.env*` (кроме `.env.example`) и `.gitsecret/keys/random_seed`; сейчас `.env`-файлы не исключены.
- git-secret в репозитории: `.gitsecret/`, отслеживаемый файл `.env.local` → в git только `.env.local.secret`.
- Отдельная пара ключей GPG для проекта (без пароля): открытый — в `.gitsecret`, закрытый — один раз в Vercel как `GIT_SECRET_PRIVATE_KEY` и локально у агента. Пользователь может добавить свой открытый ключ (`git secret tell`).
- Расшифровка без бинарника git-secret на Vercel: скрипт на `openpgp` (npm, чистый JS) читает `GIT_SECRET_PRIVATE_KEY` и `.env.local.secret`.
  - перед `next build` (`prebuild`) — пишет `.env.production.local`, чтобы `NEXT_PUBLIC_*` встроились в сборку;
  - на сервере во время работы — модуль `src/lib/secrets.ts` (`server-only`) расшифровывает один раз на холодный старт и отдаёт серверные ключи (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` и др.), если их нет в `process.env`.
- Локально и в worktree исполнителей: `npm run secrets:reveal` (git-secret или тот же скрипт) создаёт `.env.local`; `npm run secrets:hide` шифрует после правки.
- README: как добавить ключ, как добавить человека, как сменить ключи.

## Impact

`.gitignore`, `.gitsecret/`, `.env.local.secret`, `.env.example`, `scripts/secrets.mjs`, `src/lib/secrets.ts`, `package.json` (`openpgp` в dependencies, скрипты), README. Новая спека `secrets`. CI без ключа зелёный.
