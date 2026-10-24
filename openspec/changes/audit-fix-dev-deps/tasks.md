## 1. Обновление
- [ ] 1.1 `npm audit fix` (без `--force`); `package.json` не меняется
- [ ] 1.2 `npm audit` и `npm audit --omit=dev` — 0 уязвимостей; если остаток требует `--force` или смены прямой зависимости, остановиться и эскалировать

## 2. Проверка
- [ ] 2.1 `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
- [ ] 2.2 `npx shadcn --help` запускается (CLI в dev-дереве цел)
