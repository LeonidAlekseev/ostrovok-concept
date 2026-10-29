## 1. Дамп и восстановление

- [x] 1.1 `scripts/db-dump.sh`, цель `dump-db`
- [x] 1.2 `scripts/db-restore.sh`, цель `restore-local`

## 2. Документация

- [x] 2.1 README, `docs/data-sources.md`, `docs/docker.md`

## 3. Проверки

- [x] 3.1 `sh -n`, `make -n`, один запуск дампа против живой базы, `pg_restore --list`
- [ ] 3.2 Восстановление в образ supabase/postgres проверяет пользователь на сервере
