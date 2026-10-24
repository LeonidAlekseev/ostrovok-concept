## 1. Изменение
- [x] 1.1 Заливка и размытие панели главной — ровно значения из proposal; `/assistant` без изменений
- [x] 1.2 Общие ободок, блик и запасной вид без дублирования
- [x] 1.3 Разделитель карточек внутри `section#search` светлый: `--decor-light` 55%, как ободок панели
- [x] 1.4 Фигурка при hover (`(hover: hover) and (pointer: fine)`) и `focus-visible` плавно увеличивается, origin снизу; без анимации при `prefers-reduced-motion`

## 2. Проверка
- [x] 2.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
- [x] 2.2 Computed style `div[data-search-panel="true"]` в браузере совпадает с proposal; скриншоты главной 360/1440 и `/assistant` вне репозитория
