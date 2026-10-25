## 1. Телефон

- [x] 1.1 Уменьшить высоту героя на телефоне в `src/components/Hero/Hero.tsx`; `md:` классы не трогать.
- [x] 1.2 Подобрать отрицательный отступ `section#search` на телефоне в `src/components/HomePage.tsx`: около 75 % высоты панели с фигурками на глобусе.
- [x] 1.3 Проверить 360 и 390 px: карточка отеля у пина не перекрыта панелью, заголовок не перекрыт. Проверить 768 и 1440 px: без изменений.

## 2. Проверки

- [x] 2.1 `npm run lint`, `npm run typecheck`, `npm test` на передний план. Выполнено в CI PR #221 (run 40119743866): lint, typecheck, test зелёные
- [x] 2.2 `openspec validate mobile-hero-overlap --strict`, `openspec archive mobile-hero-overlap --yes`, `openspec validate --all --strict`.
