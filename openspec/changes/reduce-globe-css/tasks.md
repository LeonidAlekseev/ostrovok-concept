# Tasks

## 1. Базовые замеры

- [x] 1.1 `npm run build`, записать размер CSS (сырой и gzip −9) в proposal.md, раздел «Замеры»; проверка: числа записаны.
- [x] 1.2 Снять скриншоты состояний из design.md; проверка: файлы в `/tmp/reduce-globe-css-screenshots/before`.

## 2. Анимации и модули

- [x] 2.1 `@keyframes` из `AssistantSearch.module.css` и `RandomSearch.module.css` в `@theme`, запуск утилитами `animate-*`, оба модуля удалены; проверка: `npm run build` проходит, скриншоты совпадают в пределах отклонений.
- [x] 2.2 `Hero` на утилиты и `@theme`, `Hero.module.css` удалён; проверка: как в 2.1.
- [x] 2.3 Убрать `static` у `@theme`; проверка: проверка `static` из design.md, скриншоты совпадают.

## 3. Правило утилит

- [x] 3.1 Привести все компоненты из proposal.md к правилу `translate`/`scale`/`rotate`/`box-shadow`; проверка: в `src/components` (кроме `ui/*`) нет `[translate:`, `[scale:`, `[rotate:`, `[box-shadow:` там, где есть стандартная утилита; скриншоты совпадают.

## 4. Итог

- [ ] 4.1 Повторить сборку и скриншоты, записать размеры и результат pixelmatch в proposal.md; проверка: числа записаны, в репозитории нет файлов скриншотов.
- [ ] 4.2 Обновить раздел «Стили» README; проверка: README соответствует коду, `find src -name '*.module.css'` пуст.
- [ ] 4.3 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` проходят.
