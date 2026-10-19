# Tasks

## 1. Зависимости

- [ ] 1.1 Записать вывод `npm audit` и `npm audit --omit=dev` в proposal.md, раздел «Замеры»; проверка: числа записаны.
- [ ] 1.2 Перенести `shadcn` в `devDependencies`; проверка: `npm ci` и `npm run build` проходят.
- [ ] 1.3 Обновить `shadcn` или добавить `overrides`, если это убирает уязвимости без breaking changes; проверка: `npm audit` после; если уязвимости остаются — причина записана в proposal.md.

## 2. Проверки

- [ ] 2.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` проходят; превью Vercel в PR собирается.
