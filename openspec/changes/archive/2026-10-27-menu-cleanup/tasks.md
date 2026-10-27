## 1. Код

- [x] 1.1 `Header.tsx`: убрать пункт «Уведомления», его состояние и панель, пункт «Поддержка», классы `panelTitleClass` и `panelTextClass`
- [x] 1.2 `Header.test.tsx`: удалить тест про уведомления, обновить список меню, добавить проверку отсутствия «Уведомления» и «Поддержка» и наличия «Мои поездки» и «API»

## 2. Спеки

- [x] 2.1 Дельта `site-header`: переименование и изменение требования меню разделов

## 3. Проверка

- [x] 3.1 `npx openspec validate menu-cleanup --strict`, архивация `npx openspec archive menu-cleanup -y`, `npx openspec validate --all --strict`
- [x] 3.2 lint, typecheck, test, format:check, build
