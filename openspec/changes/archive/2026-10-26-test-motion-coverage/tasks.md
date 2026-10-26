## 1. Карточка глобуса

- [x] 1.1 `Hero.test.tsx`: тест проявления карточки при смене города (обычный режим)
- [x] 1.2 `Hero.test.tsx`: тест без анимации при `reducedMotion`, через `setScreen(NARROW, { reducedMotion: true })`

## 2. Прокрутка результатов

- [x] 2.1 `searchResultsTestKit.tsx`: опция `reducedMotion` в `open`
- [x] 2.2 `SearchResultsPage.motion.test.tsx`: `smooth` и фокус в обычном режиме, `auto` и фокус при reduced motion; шпион снимается после теста
- [x] 2.3 Спецификация `search-results-page`: требование «Прокрутка к результатам при смене страницы»

## 3. Проверка

- [x] 3.1 `npx openspec validate test-motion-coverage --strict`
- [x] 3.2 `npx openspec archive test-motion-coverage --yes`
- [x] 3.3 `npx openspec validate --all --strict`
- [x] 3.4 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
