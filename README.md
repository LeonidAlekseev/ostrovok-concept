# О!бъективно — за гранью поиска

**Найдите не просто отель. Найдите свой отель.**

Опишите, каким вы представляете идеальный отдых, — и Эвал подберёт отель в Валенсии, который соответствует вашим
ожиданиям.

Настоящие отели, поиск по смыслу, фотографии, карта и ИИ-помощник, который знает больше, чем стандартные фильтры.

Тишина, вид из окна, этаж, окружение, отзывы — Эвал поможет разобраться в деталях. А если ответа нет, спросит напрямую
у отельера.

Вы задаёте критерии. Эвал находит совпадения. Вы выбираете с уверенностью.

- Видео (Google Drive): https://drive.google.com/drive/folders/1OqgiaKfaIsCUoaC14TO32cFgW4dHG0A5?usp=sharing
- Сервис (Vercel Production): https://lilteam-ostrovok.vercel.app

## Быстрый старт

Нужен только Docker (Docker Desktop на Windows и macOS). Установка Node.js не нужна.

```bash
git clone https://github.com/ostrovok-hackathon-2026/lil-team.git
cd lil-team
cp .env.example .env     # вписать значения переменных или только AGE_SECRET_KEY (см. ниже)
docker compose up --build
```

Через 5–10 минут (первая сборка) http://localhost:8080 работает. Остановить: `Ctrl+C`, затем `docker compose down`.

То же короче — через `make` (на Windows без `make` используйте команды из правой колонки):

| Команда     | Что делает                                            | Без `make`                                                     |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `make up`   | собрать образ и запустить приложение на `:8080`       | `docker compose up --build`                                    |
| `make down` | остановить и удалить контейнеры                       | `docker compose down`                                          |
| `make logs` | логи приложения в реальном времени                    | `docker compose logs -f app`                                   |
| `make seed` | загрузить и пересобрать данные в облачной базе `.env` | `docker compose run --rm --build tools sh scripts/seed-all.sh` |

Ключи в `.env` даются двумя способами:

1. Одна строка `AGE_SECRET_KEY=AGE-SECRET-KEY-1…` — закрытый ключ приложения. Остальные переменные приложение и сборка
   расшифруют сами из `secrets.app.env.age`.
2. Все переменные из `.env.example` со значениями. Организаторы берут их из `secrets.env.age`
   (`age -d -i <свой ключ> -o .env secrets.env.age`).

Пошагово для Docker Desktop (Windows, macOS) — [docs/docker.md](docs/docker.md).

## Зависимости и переменные окружения

**Ресурсы.** Контейнер приложения (Next.js standalone, Node 24): около 1 CPU и 512 МБ RAM; образ ≈ 460 МБ. Сборка:
2 CPU и 4 ГБ RAM, 3 ГБ диска, нужна сеть (каталог пререндерится из Supabase). Платформа `linux/amd64`.

**Зависимости.** Docker с Compose v2. Внешние сервисы: облачный Supabase (Postgres, Auth, Storage), GigaChat и NVIDIA API. Версии пакетов — `package-lock.json`.

**Переменные** (`.env`, подписи и источники — в `.env.example`):

| Переменная                                      | По умолчанию      | Назначение                                                                           |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `AGE_SECRET_KEY`                                | пусто             | ключ приложения; если задан, недостающие переменные берутся из `secrets.app.env.age` |
| `NEXT_PUBLIC_SUPABASE_URL`                      | пусто             | URL проекта Supabase (нужен при сборке)                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                 | пусто             | публичный ключ Supabase (нужен при сборке)                                           |
| `SUPABASE_SERVICE_ROLE_KEY`                     | пусто             | серверный ключ Supabase, только на сервере                                           |
| `SUPABASE_DB_URL`                               | пусто             | строка подключения к базе: нужна `make seed` и миграциям                             |
| `NVIDIA_API_KEY`                                | пусто             | ключ NVIDIA API; без него Эвал отвечает по правилам, без модели                      |
| `GIGACHAT_AUTH_KEY`                             | пусто             | Authorization key GigaChat (Сбер), developers.sber.ru → GigaChat API                 |
| `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`         | пусто             | демо-путешественник (вход кнопкой, `make seed` создаёт аккаунт)                      |
| `DEMO_HOTELIER_EMAIL`, `DEMO_HOTELIER_PASSWORD` | пусто             | демо-отельер (то же)                                                                 |
| `PORT`, `HOSTNAME`                              | `8080`, `0.0.0.0` | порт и адрес сервера в контейнере (заданы в `Dockerfile`)                            |

**Ключи для организаторов — `secrets.env.age` в корне репозитория.** Это зашифрованный `.env` со всеми переменными
таблицы выше. Он зашифрован только публичным ключом организаторов
`age1932fu7f70rwyfhaxflyfszz4gf6avxwc95wc0yjwm6zns9tspycqpgdnc0`, прочитать его можно только их закрытым ключом:

```bash
age -d -i <закрытый ключ организаторов> -o .env secrets.env.age
docker compose up --build
```

Второй файл, `secrets.app.env.age`, зашифрован ключом приложения (`AGE_SECRET_KEY`) для Vercel и Docker. Открытый
`.env` в git не попадает: он в `.gitignore`, а `git ls-files .env` ничего не выводит. Подробности —
[docs/secrets.md](docs/secrets.md).

### Почему база внешняя

Compose поднимает только приложение, а базой служит облачный Supabase: в нём лежат готовые данные Валенсии (отели
Островка, фото, отзывы, векторы поиска), здания EUBUCCO и контуры шума EEA в PostGIS, векторы в pgvector и сама
авторизация Supabase (Auth, RLS, Storage). Локальный Postgres пришлось бы заполнять заново: геоданные — около 1,6 ГБ
файлов вне репозитория и часы загрузки, векторы — пересчёт через NVIDIA API с лимитом 40 запросов в минуту, плюс поднять
GoTrue и Storage для входа и фото. Поэтому данные не копируются, а ключи к облаку лежат в секретах.

## Сидирование

База уже заполнена. Заново загрузить и пересобрать данные (в **облачную** базу из `.env`) — `make seed`: внутри
`docker compose run` выполняет `scripts/seed-all.sh`, то есть команды `package.json` по порядку:

| Шаг | Команда                         | Что делает                                                   |
| --- | ------------------------------- | ------------------------------------------------------------ |
| 1   | `npm run db:push`               | применяет миграции `supabase/migrations/`                    |
| 2   | `npm run db:seed`               | каталог-генератор и демо-путешественник                      |
| 3   | `npm run db:hotelier`           | аккаунт и профиль демо-отельера                              |
| 4   | `npm run db:seed:hotelier-demo` | демо-переписки с отельером (помечены «демо»)                 |
| 5   | `npm run db:rebuild:ota`        | пересборка настоящих отелей каталога из данных Островка      |
| 6   | `npm run db:features`           | здание, шум, окружение, вид из номера, хранилище утверждений |
| 7   | `npm run db:embed`              | векторы поиска по смыслу (NVIDIA, до 40 запросов в минуту)   |
| 8   | `npm run db:embed:chunks`       | векторы отзывов и сведений отельера                          |
| 9   | `npm run db:embed:photos`       | векторы фото для «Найти похожие» (12–15 минут)               |

Шаги идемпотентны. Отдельная команда: `docker compose run --rm tools npm run db:features -- --dry-run`. Загрузки из
внешних файлов (`db:seed:valencia`, `db:load:ota-pages`, `load-valencia-geo.py`, `db:city-places`) в `make seed` не
входят; описание всех скриптов — [docs/data-and-scripts.md](docs/data-and-scripts.md).

## Маршруты и доступ

| Маршрут                   | Что                                                 |
| ------------------------- | --------------------------------------------------- |
| `/`                       | главная: глобус, поиск, новые отели                 |
| `/health`                 | `200 { "status": "ok" }`, для healthcheck           |
| `/api/docs`               | документация API (OpenAPI, Scalar)                  |
| `/assistant`              | чат с Эвалом                                        |
| `/hotelier`               | кабинет отельера: вопросы путешественников и ответы |
| `/search`, `/hotels/<id>` | результаты, страница отеля                          |

**Тестовый доступ.** Пароли в README не публикуются. Откройте `/login`: кнопка «Войти в демо-аккаунт» входит демо-путешественником, «Демо отельер» — демо-отельером (кабинет `/hotelier`).
Демо-данные помечены «демо».

## LLM

Текст отвечает **GigaChat Ultra** (`GigaChat-3-Ultra`, Сбер, ключ `GIGACHAT_AUTH_KEY`), остальное и запасные текстовые модели — **NVIDIA API** (build.nvidia.com, ключ `NVIDIA_API_KEY`, лимит 40 запросов в минуту).

| Задача                                | Модель                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Текст (помощник, понимание пожелания) | `gigachat/GigaChat-3-Ultra` → `nvidia/nemotron-3.5-lightning-30b-a3b` → `nvidia/nemotron-3.5-bolt-e4b` → `minimaxai/minimax-m3.1-flash` |
| Фото в чате                           | `nvidia/nemotron-3.5-super-vl-120b-a12b` → `minimaxai/minimax-m3.1-flash`                                                               |
| Эмбеддинги текста                     | `nvidia/nemotron-3.5-embed-1b`                                                                                                          |
| Реранк                                | `nvidia/nemotron-3.5-rerank-8b`                                                                                                         |
| Эмбеддинги фото                       | `nvidia/llama-nemotron-embed-vl-1b-v2`                                                                                                  |

Цепочка `→`: следующая модель отвечает, если предыдущая не уложилась в срок или ошиблась. Без ключа или при сбое Эвал отвечает по правилам. Подробности — [docs/search-and-ai.md](docs/search-and-ai.md).

## Документация

- [docs/architecture.md](docs/architecture.md) — стили, глобус, состояние в браузере, изображения
- [docs/pages.md](docs/pages.md) — страницы и интерфейс
- [docs/search-and-ai.md](docs/search-and-ai.md) — режимы поиска, поиск по смыслу, модели
- [docs/retrieval.md](docs/retrieval.md) — граф знаний (KAG), фрагменты и гибридный поиск (RAG), поиск по смыслу и по фото
- [docs/geo-methods.md](docs/geo-methods.md) — положение солнца, линия взгляда, уровни шума
- [docs/data-and-scripts.md](docs/data-and-scripts.md) — Supabase, каталог, скрипты загрузки данных
- [docs/api.md](docs/api.md) — документация API
- [docs/secrets.md](docs/secrets.md) — ключи и секреты (age)
- [docs/docker.md](docs/docker.md) — Docker и Docker Desktop
- [docs/vercel.md](docs/vercel.md) — деплой на Vercel
- [docs/development.md](docs/development.md) — разработка, тесты, CI, визуальная проверка
- [docs/tools.md](docs/tools.md) — инструменты Эвала
