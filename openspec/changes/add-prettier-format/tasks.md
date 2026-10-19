# Tasks

## 1. Подключение Prettier

- [x] 1.1 Установить `prettier` как devDependency; добавить скрипты `format` (`prettier --write .`) и `format:check` (`prettier --check .`) в `package.json`; проверка: `npm run format:check` запускается и находит нарушения до форматирования.

## 2. Форматирование проекта

- [ ] 2.1 Запустить `npm run format` и закоммитить результат отдельным коммитом; проверка: `git show --stat` содержит только форматирование и `package.json`/lockfile.
- [ ] 2.2 Проверить, что после форматирования `npm run format:check`, `npm run typecheck`, `npm run lint` и `npm run build` проходят; проверка: все четыре команды завершаются с кодом 0.

## Workflow follow-up

- Согласовать порядок слияния с `migrate-composite-components`.
