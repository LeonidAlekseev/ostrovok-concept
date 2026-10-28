# Ключи API

В репозитории лежат только зашифрованные [age](https://github.com/FiloSottile/age) файлы (бинарный формат); открытый
`.env` в `.gitignore`, `git ls-files .env` пуст. `.env.example` — те же имена, значения пустые, у каждой подписано,
откуда взять ключ.

- `secrets.env.age` — `.env` для организаторов, получатель — только их ключ
  (`age -r age1932fu7f70rwyfhaxflyfszz4gf6avxwc95wc0yjwm6zns9tspycqpgdnc0 -o secrets.env.age .env`).
- `secrets.app.env.age` — тот же `.env` для приложения, получатель — только ключ приложения
  `age1r0g77nfftvy2pc7taq5rzu8achvylulttze8vjxru4z406ezwees7m5q4u`. Закрытая часть (`AGE-SECRET-KEY-1…`) хранится вне git
  и лежит в `AGE_SECRET_KEY` на Vercel и в Docker. Организаторы этот файл не читают, а приложение — файл организаторов.
- **Docker и `.env`** — `AGE_SECRET_KEY` в `.env` пишется одной строкой `AGE_SECRET_KEY=AGE-SECRET-KEY-1…` (без кавычек);
  организаторы читают свой файл: `age -d -i <их ключ> secrets.env.age > .env`.
- **Раскрыть** — `npm run secrets:reveal` (нужен `AGE_SECRET_KEY`: одна строка `AGE-SECRET-KEY-1…` или весь файл
  `age-keygen`) пишет `.env` из `secrets.app.env.age`.
- **Обновить секреты** — править `.env` (UTF-8 без BOM, `KEY=value` без кавычек и пробелов), затем
  `npm run secrets:encrypt` пересоздаёт оба файла (пакет `age-encryption`, бинарник `age` не нужен; формат проверяется
  до записи) и коммит `secrets.env.age`, `secrets.app.env.age`. Новое имя переменной — ещё и в `.env.example`.
  Проверка: `age -d -i age-app.key secrets.app.env.age | diff - .env`; `age-inspect secrets.env.age` — один получатель
  X25519.
- **Сменить ключ приложения** — `age-keygen -o age-app.key`, открытый ключ — в `APP_RECIPIENT`
  (`src/lib/secretsFile.mjs`) и сюда, `npm run secrets:encrypt`, новый закрытый ключ — в `AGE_SECRET_KEY` на Vercel и
  у тех, кто запускает Docker. Старые копии файла остаются в истории git: ключи API поменять.
- **Сборка** — `prebuild` (`node scripts/secrets.mjs build`) при наличии `AGE_SECRET_KEY` пишет
  `.env.production.local`, из которого `next build` встраивает `NEXT_PUBLIC_*`; `.env` при этом не трогается.
  Без ключа (CI) шаг пропускается, сборка и тесты проходят; на Vercel без ключа сборка останавливается с причиной.
- **Сервер** — `getSecret(name)` из `src/lib/secrets.ts` (`server-only`) берёт `process.env[name]`, иначе один раз на
  холодный старт расшифровывает `secrets.app.env.age` (файл попадает в функции Vercel и в образ Docker через
  `outputFileTracingIncludes` в `next.config.ts`). Нет ключа — `undefined`, код работает в режиме без ключей. Клиент
  серверные ключи не получает.
