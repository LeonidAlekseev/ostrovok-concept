## 1. Генерация
- [x] 1.1 Скрипт `db:types` в `package.json`, сгенерировать `src/lib/db/database.types.ts`; файл форматируется Prettier или исключён из `format:check` осознанно
- [x] 1.2 README: перегенерировать типы после миграции

## 2. Переход
- [x] 2.1 Клиенты Supabase типизированы `Database`
- [x] 2.2 Ручные типы строк заменены на производные от `Database`

## 3. Проверка
- [x] 3.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
