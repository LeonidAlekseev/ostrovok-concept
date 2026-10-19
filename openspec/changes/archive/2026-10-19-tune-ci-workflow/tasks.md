# Tasks

## 1. CI

- [x] 1.1 `cancel-in-progress` только для `pull_request`; проверка: YAML валиден, условие в `ci.yml`.
- [x] 1.2 `actions/checkout` и `actions/setup-node` по полному SHA с комментарием тега; проверка: SHA совпадают с тегами по `gh api`, CI в PR зелёный.

## 2. Документация

- [x] 2.1 Добавить `npm test` и `npm run format:check` в раздел «Запуск» README; проверка: список совпадает со `scripts` в `package.json`.

## 3. Проверки

- [x] 3.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` проходят; проверка `CI / checks` в PR зелёная.
