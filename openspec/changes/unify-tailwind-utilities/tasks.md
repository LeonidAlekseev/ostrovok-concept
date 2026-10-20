# Tasks

## 1. Утилиты

- [ ] 1.1 `Hero`: `[&:hover]` → `hover:`, без `!`; проверка: в `src/components` нет `[&:hover]`, тест выбранного пина проходит, скриншоты с мышью совпадают.
- [ ] 1.2 Барабан: `translate-y-(--…)` вместо `transform` в `style`; переходы на стандартных утилитах; проверка: в `src/components` (кроме `ui/*`) нет `[transition:` и `transform:` в `style`, скриншоты совпадают.
- [ ] 1.3 Анимация аккордеона в `@theme` и классы в `ui/accordion`; проверка: в браузере вопрос раскрывается плавно, с `prefers-reduced-motion` — без анимации.

## 2. Итог

- [ ] 2.1 README «Стили» и комментарий в `globals.css`; проверка: README соответствует коду.
- [ ] 2.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` проходят. Скриншоты — только вне репозитория.
