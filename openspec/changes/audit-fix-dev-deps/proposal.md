## Why
`npm audit` на `dbe0d5b` находит 2 уязвимости в dev-дереве: `body-parser` 2.3.0 (high, GHSA-27r3-jxmh-p828, через `shadcn` → `@modelcontextprotocol/sdk` → `express`) и `fast-uri` 3.1.8 (moderate, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp, через `ajv`). В продакшен-зависимостях уязвимостей нет. Для обеих есть исправление через `npm audit fix` без смены прямых зависимостей.

## What Changes
- `npm audit fix` без `--force`: обновляются только транзитивные версии в `package-lock.json`.
- `package.json` не меняется.

## Impact
- `package-lock.json`. Specs не меняются.
