# secrets Specification

## Purpose
Ключи API хранятся в репозитории зашифрованными git-secret (`.env.local.secret`); сборка и сервер получают их, имея в окружении только `GIT_SECRET_PRIVATE_KEY`.

## Requirements

### Requirement: Зашифрованные ключи в репозитории
Ключи API SHALL храниться в репозитории только зашифрованными git-secret (`.env.local.secret`); открытые `.env`-файлы и закрытые ключи SHALL не попадать в git.

#### Scenario: Статус
- **WHEN** разработчик раскрыл ключи и запустил `git status`
- **THEN** `.env.local` и закрытый ключ не видны как новые файлы

### Requirement: Один ключ в Vercel
Сборка и сервер SHALL получать все ключи API из `.env.local.secret`, имея в окружении только `GIT_SECRET_PRIVATE_KEY`. Без этого ключа сборка и тесты SHALL проходить, а функции с ключами — работать в режиме без ключей.

#### Scenario: Сборка с ключом
- **WHEN** в окружении есть только `GIT_SECRET_PRIVATE_KEY` и запускается сборка
- **THEN** `NEXT_PUBLIC_*` из зашифрованного файла встроены, серверный код получает `OPENROUTER_API_KEY`

#### Scenario: Без ключа
- **WHEN** `GIT_SECRET_PRIVATE_KEY` нет
- **THEN** сборка и тесты проходят
