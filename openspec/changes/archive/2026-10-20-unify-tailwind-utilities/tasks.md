# Tasks

## 1. Утилиты

- [x] 1.1 `Hero`: `[&:hover]` → `hover:`, без `!`; проверка: в `src/components` нет `[&:hover]`, тест выбранного пина проходит, скриншоты с мышью совпадают.
- [x] 1.2 Барабан: `translate-y-(--…)` вместо `transform` в `style`; переходы на стандартных утилитах; проверка: в `src/components` (кроме `ui/*`) нет `[transition:` и `transform:` в `style`, скриншоты совпадают.
- [x] 1.3 Анимация аккордеона в `@theme` и классы в `ui/accordion`; проверка: в браузере вопрос раскрывается плавно, с `prefers-reduced-motion` — без анимации.

## 2. Итог

- [x] 2.1 README «Стили» и комментарий в `globals.css`; проверка: README соответствует коду.
- [x] 2.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` проходят. Скриншоты — только вне репозитория.
