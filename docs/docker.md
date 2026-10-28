# Docker

Запуск приложения в контейнере (Docker Desktop, Windows и macOS). Compose поднимает только приложение; база — облачный
Supabase (причины — в [README](../README.md#почему-база-внешняя)).

## Оглавление

- [Файлы](#файлы)
- [Docker Desktop (Windows, macOS)](#docker-desktop-windows-macos)
- [Что внутри образа](#что-внутри-образа)
- [TLS: сертификат НУЦ Минцифры (GigaChat)](#tls-сертификат-нуц-минцифры-gigachat)
- [Сидирование](#сидирование)

## Файлы

- `Dockerfile` — стадии `deps` (`npm ci`), `source`, `build` (`next build` с `output: 'standalone'`, включается
  `NEXT_OUTPUT=standalone` только в образе), `runner` (только `server.js`, `.next/static`, `public`, `secrets.app.env.age`)
  и `tools` (зависимости и `scripts/` для `make seed`). Базовый образ закреплён: `node:24.22.1-alpine3.24`.
- Рантайм — Alpine с busybox (POSIX sh, без bash), процесс от пользователя `app`, порт `8080`, логи в stdout и stderr.
- `docker-compose.yml` — сервис `app` (`platform: linux/amd64`, `env_file: .env`, `8080:8080`, healthcheck по `/health`)
  и сервис `tools` (профиль `tools`, `up` его не запускает).
- `docker-compose.override.yml` — ротация логов и монтирование `secrets.app.env.age` (обновить секреты можно
  перезапуском, без пересборки).
- `Makefile` — `make up`, `make down`, `make logs`, `make seed`.
- `.dockerignore` — `.env*`, `*.key`, `.git`, `node_modules` не попадают в контекст сборки.

## Docker Desktop (Windows, macOS)

1. Установить [Docker Desktop](https://www.docker.com/products/docker-desktop/) и запустить его (на Windows включить
   WSL 2 в мастере установки). Проверить: `docker --version`.
2. `git clone <репозиторий>` и `cd` в папку.
3. `cp .env.example .env` (Windows PowerShell: `Copy-Item .env.example .env`) и вписать значения:
   - либо **все переменные** — значения даёт владелец проекта, они лежат в `secrets.env.age` (для организаторов,
     `age -d -i <их ключ> secrets.env.age > .env`);
   - либо **одну `AGE_SECRET_KEY=AGE-SECRET-KEY-1…`** — ключ приложения, остальное расшифруется из `secrets.app.env.age`.
4. `docker compose up --build` (или `make up`), затем http://localhost:8080.
5. Остановить: `Ctrl+C`, затем `docker compose down` (`make down`).

На Apple Silicon образ собирается как `linux/amd64` (эмуляция Docker Desktop), сборка идёт медленнее.

## Что внутри образа

Секретов нет: `COPY .env` отсутствует, значения не пишутся в слои. Сборке нужны `NEXT_PUBLIC_SUPABASE_URL` и
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (каталог пререндерится из Supabase): их compose передаёт аргументами сборки из `.env`, а
если их нет — расшифровывает из `secrets.app.env.age` ключом `AGE_SECRET_KEY`, который передаётся секретом сборки
(`--mount=type=secret`) и в образе не остаётся. Во время работы серверные ключи берутся из окружения контейнера
(`env_file`) или расшифровываются из `secrets.app.env.age` (см. [«Ключи API»](secrets.md)).

## TLS: сертификат НУЦ Минцифры (GigaChat)

`gigachat.devices.sberbank.ru` отдаёт сертификат, выпущенный Russian Trusted Sub CA под корнем **Russian Trusted Root CA**
(НУЦ Минцифры). Его нет в хранилище Node, поэтому без корня запрос падает с `SELF_SIGNED_CERT_IN_CHAIN`. Корневой
сертификат лежит в репозитории — `certs/russian_trusted_root_ca.pem` (публичный, скачан с
https://gu-st.ru/content/Other/doc/russian_trusted_root_ca.cer, SHA-256
`D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31`, действует до
2032-02-27) — и подключается в `Dockerfile` (стадии `runner` и `tools`) переменной
`NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_root_ca.pem`: Node добавляет его к обычным корням, остальные HTTPS-адреса
(Supabase, NVIDIA) проверяются как раньше. Промежуточный Sub CA сервер присылает сам. Проверка вне Docker:
`NODE_EXTRA_CA_CERTS=certs/russian_trusted_root_ca.pem node -e "fetch('https://gigachat.devices.sberbank.ru/api/v1/models').then(r=>console.log(r.status))"`
печатает `401` (без ключа), без переменной — `SELF_SIGNED_CERT_IN_CHAIN`.

На Vercel (нативная сборка) `NODE_EXTRA_CA_CERTS` нужно задать в Environment Variables путём к файлу, который есть в
функции; проще передать сертификат в запрос самому (`ca` в `https.Agent`/`undici.Agent`), читая
`certs/russian_trusted_root_ca.pem` (включить файл в `outputFileTracingIncludes`). Это делает код, который вызывает GigaChat.

## Сидирование

`make seed` запускает сервис `tools` и по порядку выполняет `scripts/seed-all.sh`: `db:push`, `db:seed`, `db:hotelier`,
`db:seed:hotelier-demo`, `db:rebuild:ota`, `db:features`, `db:embed`, `db:embed:chunks`, `db:embed:photos`. Описание
каждой команды — [«Данные и скрипты»](data-and-scripts.md). Шаги идемпотентны, но пишут в **облачную базу** из `.env`,
`db:push` применяет миграции; `db:embed*` ходят в NVIDIA API (до 40 запросов в минуту, эмбеддинги фото — 12–15 минут).
Отдельная команда: `docker compose run --rm tools npm run db:features -- --dry-run`.
Загрузки из внешних файлов (`db:seed:valencia`, `db:load:ota-pages`, `load-valencia-geo.py`, `db:city-places`) в
`make seed` не входят: исходные данные лежат вне репозитория.

[← README](../README.md)
