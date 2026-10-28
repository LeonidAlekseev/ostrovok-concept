# Разработка и тесты

Запуск, проверки, CI и визуальная проверка страниц.

## Запуск

Провайдер LLM — NVIDIA API, модели по задачам — в [«Модели»](search-and-ai.md#модели). Без `NVIDIA_API_KEY` помощник отвечает по правилам.

Шаги запуска (нужны Node.js ≥ 22 и ключ приложения `AGE_SECRET_KEY`, см. [«Ключи API»](secrets.md#ключи-api)):

```bash
npm install
export AGE_SECRET_KEY="$(cat age-app.key)"   # файл ключа приложения, в git его нет
npm run secrets:reveal                      # создаёт .env из secrets.app.env.age
npm run dev        # http://localhost:3000
npm run build      # production-сборка (страница пререндерится статически)
npm run start      # запуск собранной версии
npm run lint
npm run typecheck
npm test
npm run format:check
```

Или без Node.js на машине — в Docker, см. [«Docker»](docker.md#docker).

Для `npm run dev` и `npm run build` нужны `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(сборка читает каталог из базы и без них останавливается). Остальные имена — в `.env.example`, у каждой подписано,
откуда брать значение. Тесты и lint ключей не требуют.

CI (GitHub Actions, `.github/workflows/ci.yml`) на каждый PR и push в `dev` и `main` запускает
`npm ci`, `npm run lint`, `npm run typecheck`, `npm test` и `npm run format:check` в job `checks`
(проверка `CI / checks`). Job `docker` проверяет Dockerfile линтером hadolint, `docker compose config` и сборку образа
(`docker build`). Сборку приложения для Vercel в CI не запускают: её выполняет Vercel.

## Визуальная проверка

`scripts/screenshots.mjs` снимает страницы в двух viewport (390×844 и 1280×800, полная высота) в
headless Chromium (`playwright-core`, браузер из `~/.cache/ms-playwright`; при отсутствии —
`npx playwright-core install chromium`) и сравнивает кадры с прошлым прогоном через `pixelmatch`
(threshold 0.1). Изображения в репозиторий не попадают: по умолчанию вывод в
`/tmp/ostrovok-screenshots/<label>/`.

```bash
npm run build && npx next start -p 3341 &
node scripts/screenshots.mjs --label before --mask canvas / /search?destination=prague
# … правки, пересборка …
node scripts/screenshots.mjs --label after --against before --mask canvas / /search?destination=prague
```

Параметры: `--base` (по умолчанию `http://localhost:3341`), `--name` и `--out` (каталог вывода),
`--label`, `--against` (с чем сравнивать), `--wait` (мс после загрузки, 1000), `--mask <selector>`
(закрасить анимируемые элементы; глобус на `/` — `canvas`). Для расхождений рядом с кадром
сохраняется `*.diff.png`; код выхода 1, если кадры различаются.

`npx next start` порождает дочерний процесс `next-server`, который держит порт: чтобы остановить
сервер, завершите PID именно `next-server` (например, `lsof -ti :3341`), а не только родительского
`npx`.

[← README](../README.md)
