## REMOVED Requirements

### Requirement: Один ключ в Vercel
**Reason**: ключ теперь `AGE_SECRET_KEY`, а не `GIT_SECRET_PRIVATE_KEY`.
**Migration**: в Vercel добавить `AGE_SECRET_KEY`, удалить `GIT_SECRET_PRIVATE_KEY`.

## MODIFIED Requirements

### Requirement: Зашифрованные ключи в репозитории
Ключи API SHALL храниться в репозитории только зашифрованными age в бинарном формате: `secrets.env.age` (получатель — ключ организаторов) и `secrets.app.env.age` (получатель — ключ приложения). Открытый `.env` и закрытые ключи SHALL не попадать в git; `.env` SHALL быть в `.gitignore`.

#### Scenario: Статус
- **WHEN** разработчик раскрыл ключи и запустил `git status`
- **THEN** `.env` и закрытый ключ не видны как новые файлы

#### Scenario: Файлы организаторов
- **WHEN** проверяют `secrets.env.age` через `age-inspect`
- **THEN** заголовок содержит ровно одну запись X25519, файл не читается как текст

#### Scenario: Git
- **WHEN** выполняют `git ls-files .env`
- **THEN** вывод пуст

## ADDED Requirements

### Requirement: Обновление зашифрованных файлов одной командой
`npm run secrets:encrypt` SHALL создавать оба файла заново из `.env`. Команда SHALL останавливаться, если `.env` содержит BOM, CRLF, кавычки, пробелы или строки не вида `KEY=value`.

#### Scenario: Совпадение
- **WHEN** `age -d -i <ключ приложения> secrets.app.env.age`
- **THEN** результат совпадает с `.env`

### Requirement: Один ключ AGE_SECRET_KEY
Сборка и сервер SHALL получать ключи API из `process.env`, а недостающие — из `secrets.app.env.age` с `AGE_SECRET_KEY`, без бинарника `age`. Без `AGE_SECRET_KEY` сборка и тесты SHALL проходить, а функции с ключами — работать в режиме без ключей.

#### Scenario: Сборка и сервер с ключом
- **WHEN** в окружении есть только `AGE_SECRET_KEY`
- **THEN** `NEXT_PUBLIC_*` встроены в сборку, серверный код получает `NVIDIA_API_KEY`

#### Scenario: Без ключа
- **WHEN** `AGE_SECRET_KEY` нет
- **THEN** сборка и тесты проходят
