# Tasks

## 1. Workflow

- [x] 1.1 Добавить `.github/workflows/ci.yml` по design.md: триггеры, `permissions: contents: read`, `concurrency`, Node 24 с кэшем npm, шаги `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`; проверка: `npm run format:check` проходит, YAML валиден.
- [x] 1.2 Упомянуть CI в README, раздел «Запуск»; проверка: README соответствует workflow.

## 2. Проверка

- [ ] 2.1 Открыть PR в `dev` и убедиться, что проверка `CI / checks` запустилась и прошла; проверка: ссылка на прогон в описании PR.
