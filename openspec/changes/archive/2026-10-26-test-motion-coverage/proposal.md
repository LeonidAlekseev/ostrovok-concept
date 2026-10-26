## Why

Тесты `prefers-reduced-motion` в `Hero.test.tsx` всегда ставили `reducedMotion: false`, поэтому ветка без анимации карточки при смене города (`Hero.tsx`, эффект карточки) не проверялась. Прокрутка результатов при смене страницы (`SearchResultsPage.tsx`, `scrollIntoView` с `behavior`) и фокус на заголовке не покрыты: тест страниц проверяет только фокус. Спецификация `search-results-page` не описывает поведение прокрутки при reduced motion, поэтому тесту нечего проверять по требованию.

## What Changes

- `src/components/Hero/Hero.test.tsx`: два теста карточки глобуса в блоке «Hero in the browser» — при смене города карточка проявляется (`animate` вызван) и при `reducedMotion` без анимации (`animate` не вызван). Оба используют `setScreen(NARROW, { reducedMotion })` из `src/test/screen.ts`.
- `src/components/SearchResultsPage/searchResultsTestKit.tsx`: `open` принимает `reducedMotion` и передаёт его в `setScreen`.
- `src/components/SearchResultsPage/SearchResultsPage.motion.test.tsx`: после перехода на вторую страницу заголовок прокручивается `smooth` (обычный режим) или `auto` (reduced motion) и получает фокус. Шпион на `Element.prototype.scrollIntoView` ставится на время теста и снимается после него.
- Спецификация `search-results-page`: ADDED требование «Прокрутка к результатам при смене страницы» с двумя сценариями.

## Impact

- Specs: `search-results-page` (ADDED).
- Code: только тестовые файлы и тестовый помощник `searchResultsTestKit.tsx`. Код приложения не меняется.
- Не покрыто: период смены пина в спотлайте при reduced motion (8 с против 5 с) и мгновенное центрирование города (`reducedMotion` в эффекте глобуса `Hero.tsx`). В jsdom выбор города зависит от геометрии вёрстки, которой нет; см. отчёт.
