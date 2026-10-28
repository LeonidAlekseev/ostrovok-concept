## Решения

- Два файла, два получателя (решение 1а/2б/3а + «два отдельных файла»): `secrets.env.age` читают только организаторы, приложению нужен отдельный `secrets.app.env.age` под наш ключ, закрытая часть которого лежит вне git.
- Бинарный формат age без `-a`; `.env` в UTF-8 без BOM, `KEY=value` без кавычек и пробелов. `secrets:encrypt` проверяет формат до записи.
- Расшифровка в рантайме: пакет `age-encryption` (чистый JS, WebCrypto), бинарник `age` в образе и на Vercel не нужен. `AGE_SECRET_KEY` принимает и одну строку `AGE-SECRET-KEY-1…`, и весь файл `age-keygen`.
- Docker: `output: standalone` включается переменной `NEXT_OUTPUT=standalone` только в образе; нативная сборка Vercel не меняется. Секрет сборки `AGE_SECRET_KEY` передаётся через `--mount=type=secret`, в слои не попадает; `.env` в образ не копируется (`.dockerignore`).
- Vercel через Docker (Dockerfile.vercel) отменён пользователем: Vercel собирает проект как раньше.
