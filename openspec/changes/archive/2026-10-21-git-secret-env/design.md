## Решение пользователя (2026-10-21)

«Установи git secret, чтобы я не парился с окружением vercel и один раз там добавил ключ, а все ключи для api код брал с git secret». Пользователь сам впишет ключи в `.env.local` в корне основного клона `/home/agent/projects/ostrovok-concept`.

## Установка

- git-secret без sudo: `git clone https://github.com/sobolevn/git-secret ~/.local/src/git-secret && make -C ~/.local/src/git-secret build && PREFIX=~/.local make -C ~/.local/src/git-secret install`; проверить `git secret --version`. Требует `gpg` (есть 2.4.4) и `gawk` (есть).
- Ключ проекта: `gpg --batch --passphrase '' --quick-gen-key "O!Pognali secrets <secrets@opognali.local>" ed25519 sign never` + подключ `cv25519 encr`. Экспорт закрытого ключа (armored) — в `~/opognali-secrets-private-key.asc` с правами 600, вне репозитория. В чат, PR, логи и коммиты закрытый ключ НЕ выводить.
- `git secret init`, `git secret tell secrets@opognali.local`, `git secret add .env.local`, `git secret hide`. Пустой `.env.local` с именами переменных из `.env.example` — стартовое содержимое, пока пользователь не впишет значения.

## Расшифровка

- `scripts/secrets.mjs reveal`: если есть `GIT_SECRET_PRIVATE_KEY` (armored, `\n` допускаются экранированными) — `openpgp.decrypt` файла `.env.local.secret` → `.env.local` (локально) или `.env.production.local` (в `prebuild` на Vercel, `VERCEL=1`). Если ключа нет — тихо выходит с кодом 0 (CI и сборки без секретов). Иначе, если установлен git-secret и ключ в gpg — `git secret reveal -f`.
- `scripts/secrets.mjs hide`: `git secret hide` (локально).
- `src/lib/secrets.ts` (`import 'server-only'`): `getSecret(name)` — `process.env[name]`, иначе ленивое расшифрование `.env.local.secret` из файловой системы функции (`outputFileTracingIncludes` в `next.config` для `.env.local.secret`), разбор dotenv, кэш в памяти модуля. Клиентский код ключи не получает; `NEXT_PUBLIC_*` берутся из сборки.
- Проверь гайды Next 16 в `node_modules/next/dist/docs/` про загрузку `.env*` и `outputFileTracingIncludes`.

## Проверка

- Юнит-тесты: разбор dotenv, отсутствие ключа, кэш, расшифровка тестовой парой ключей, сгенерированной в тесте `openpgp`.
- Живая проверка: зашифровать тестовое значение, удалить `.env.local`, `GIT_SECRET_PRIVATE_KEY="$(cat ~/opognali-secrets-private-key.asc)" node scripts/secrets.mjs reveal` восстанавливает файл; `next build` с ключом встраивает `NEXT_PUBLIC_*`.
- `git status` после всего — нет `.env.local`, `.env.production.local`, закрытого ключа.
