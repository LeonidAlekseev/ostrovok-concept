# Docker

Запуск приложения в контейнере (Docker Desktop, Windows и macOS). Два варианта:

- **основной** (`docker-compose.yml`, `make up`): только приложение, база — облачный Supabase (причины — в
  [README](../README.md#почему-база-внешняя)); так требуют организаторы;
- **дополнительный** (`docker-compose.local.yml`, `make up-local`): приложение и своя минимальная Supabase, см.
  [«Локальная Supabase»](#локальная-supabase-дополнительно).

## Оглавление

- [Файлы](#файлы)
- [Docker Desktop (Windows, macOS)](#docker-desktop-windows-macos)
- [Что внутри образа](#что-внутри-образа)
- [TLS: сертификат НУЦ Минцифры (GigaChat)](#tls-сертификат-нуц-минцифры-gigachat)
- [Сидирование](#сидирование)
- [Локальная Supabase (дополнительно)](#локальная-supabase-дополнительно)

## Файлы

- `Dockerfile` — стадии `deps` (`npm ci`), `source`, `build` (`next build` с `output: 'standalone'`, включается
  `NEXT_OUTPUT=standalone` только в образе), `runner` (только `server.js`, `.next/static`, `public`, `secrets.app.env.age`)
  и `tools` (зависимости и `scripts/` для `make seed`; плюс `uv` и `python3` из apk для `scripts/*.py`, в `runner` их нет). Базовый образ закреплён: `node:24.22.1-alpine3.24`.
- Рантайм — Alpine с busybox (POSIX sh, без bash), процесс от пользователя `app`, порт `8080`, логи в stdout и stderr.
- `docker-compose.yml` — сервис `app` (`platform: linux/amd64`, `env_file: .env`, `8080:8080`, healthcheck по `/health`)
  и сервис `tools` (профиль `tools`, `up` его не запускает).
- `docker-compose.override.yml` — ротация логов и монтирование `secrets.app.env.age` (обновить секреты можно
  перезапуском, без пересборки).
- `docker-compose.local.yml`, `docker/local-supabase/`, `.env.local-supabase.example` — дополнительный вариант с локальной
  Supabase.
- `Makefile` — `make up`, `make down`, `make logs`, `make seed`; `make up-local`, `make down-local`, `make seed-local`, `make seed-local-geo`.
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

## Локальная Supabase (дополнительно)

`docker-compose.local.yml` — фронтенд и минимальная Supabase из официального self-host, без Studio. Образы закреплены,
`platform: linux/amd64`: `supabase/postgres:15.8.1.085`, `supabase/gotrue:v2.177.0` (Auth), `postgrest/postgrest:v13.0.4`
(REST), `supabase/realtime:v2.34.47`, `supabase/storage-api:v1.25.7`, `kong:2.8.1` (шлюз, `docker/local-supabase/kong.yml`).

1. `cp .env.local-supabase.example .env.local-supabase`. В файле пароль Postgres, JWT secret и два ключа (`ANON_KEY`,
   `SERVICE_ROLE_KEY`): стандартные демо-ключи self-host, подписанные этим секретом, **только для локального запуска**
   (порты открыты на `127.0.0.1`). Секреты в git не попадают (`.env.*` в `.gitignore`, в репозитории только образец).
   Свои ключи — любые JWT HS256 с ролями `anon` и `service_role`, подписанные `JWT_SECRET`.
2. `.env` (как для основного варианта) нужен для ключей моделей `NVIDIA_API_KEY`, `GIGACHAT_AUTH_KEY` и демо-аккаунтов
   `DEMO_USER_*`, `DEMO_HOTELIER_*`. Адрес и ключи Supabase из `.env` локальный вариант перекрывает.
3. `make up-local` (`docker compose --env-file .env.local-supabase -f docker-compose.local.yml up --build`) поднимает базу
   и сервисы. Приложение собирается из того же `Dockerfile` (стадия `tools`) уже на старте: каталог пререндерится из
   базы, поэтому `docker/local-supabase/app.sh` ждёт данные и только потом выполняет `npm run build` и `next start`.
4. `make seed-local` в другом терминале: сервис `tools` выполняет `scripts/seed-all.sh` против локальной базы — миграции
   (`db:push`), каталог и демо-путешественник, демо-отельер, демо-чаты с отельером, пересборка настоящих отелей,
   свойства, векторы. После этого приложение собирается и открывается на http://localhost:8080.
5. `make seed-local-geo` (по желанию, после шага 4): здания EUBUCCO, границы, места OSM и пересчёт `db:features` прямо из
   первоисточников; шум EEA — `NOISE_GPKG=/путь/к/ES.gpkg make seed-local-geo`. Подробности — в
   [«Источниках данных»](data-sources.md#make-seed-local-geo-геоданные-валенсии-в-локальную-базу).
6. `make down-local` останавливает всё; данные лежат в томах `db-data` и `storage-data` (`docker volume ls`), удалить их
   — `docker compose --env-file .env.local-supabase -f docker-compose.local.yml down -v`.

Браузер и контейнеры ходят в Supabase по одному адресу `http://supabase.localhost:8000` (Kong): `*.localhost` — петля в
браузере, а внутри сети это псевдоним Kong, так что cookie сессии Auth совпадают на сервере и в браузере. Postgres
доступен снаружи на `127.0.0.1:54322`. Embedding-модели и GigaChat по-прежнему удалённые, поэтому `db:embed*` ходят в
NVIDIA API (до 40 запросов в минуту). Данные внешних источников (Островок, EUBUCCO, шум EEA, места OSM) в
`seed-all.sh` не входят: геоданные грузит `make seed-local-geo`, остальное описано в [«Источниках данных»](data-sources.md). Без настоящих отелей
(`ota-*`) демо-чаты с отельером пропускаются.

[← README](../README.md)
