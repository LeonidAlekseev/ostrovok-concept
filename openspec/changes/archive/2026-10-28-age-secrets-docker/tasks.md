## 1. Секреты age
- [x] 1.1 `.env` из `.env.local.secret`, `secrets.env.age` (ключ организаторов), `secrets.app.env.age` (наш ключ).
- [x] 1.2 `secrets:encrypt`, `secrets:reveal`, prebuild; `src/lib/secrets.ts`, `secretsFile.mjs`, тесты.
- [x] 1.3 Удалить git-secret, `openpgp`; `.gitignore`, `.env.example`.
## 2. Docker
- [x] 2.1 `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `output: standalone` в образе.
- [x] 2.2 Проверка: `docker compose up --build`, `/`, страница отеля, `/api/docs`.
## 3. Документация
- [x] 3.1 README: NVIDIA и модели, запуск, Docker Desktop, Vercel, обновление секретов.
