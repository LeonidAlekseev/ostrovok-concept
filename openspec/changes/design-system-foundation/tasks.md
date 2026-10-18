# Tasks

## 1. Базовая линия

- [x] 1.1 Снять эталонные скриншоты главной до изменений на ширинах 375, 768 и 1280 px (вкладки «Ассистент», «Вручную», «Случайность»; открытые панели шапки, дат и гостей) во временную папку вне git и убедиться, что `npm run typecheck`, `npm run lint`, `npm run build` проходят на текущем коде

## 2. Инфраструктура

- [x] 2.1 Добавить `"paths": { "@/*": ["./src/*"] }` в `tsconfig.json` и проверить `npm run typecheck`
- [x] 2.2 Установить `tailwindcss` и `@tailwindcss/postcss`, создать `postcss.config.mjs` по гайду Next 16 и проверить, что `npm run build` проходит и в CSS есть утилиты Tailwind
- [ ] 2.3 Выполнить `npx shadcn@latest init -t next -b base` отдельным коммитом и проверить, что появились `components.json` (ui → `@/components/ui`, utils → `@/lib/utils`, iconLibrary → lucide), `src/lib/utils.ts` с `cn()` и зависимости `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`
- [ ] 2.4 Слить сгенерированный `globals.css` с прежним: вернуть ресеты в `@layer base`, `.visually-hidden`, блок reduced motion и шрифты, удалить `.dark`; проверить `npm run build` и сверить страницу со скриншотами 1.1

## 3. Токены

- [ ] 3.1 Описать в `globals.css` слой бренда (`--brand-*`, значения из `specs/design-system`), семантические роли из D1 и `@theme inline`; проверить, что классы `bg-primary`, `text-muted-foreground`, `border-border` дают цвета бренда
- [ ] 3.2 Добавить токены теней (`--shadow-soft`, `--shadow-card`, `--shadow-popover`) и `--decor-*` для конфетти, робота, барабана и прочих литералов модулей с прежними значениями
- [ ] 3.3 Перевести все `*.module.css` со старых имён (`--blue`, `--text-2`, …) и литералов на роли, `color-mix()` и `--decor-*`, удалить старые имена; проверить, что `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include=*.module.css` ничего не находит, а цвета на скриншотах прежние
- [ ] 3.4 Перенести цвета из TSX (`RobotAvatar`, `CONFETTI` в `RandomSearch`, `PinIcon` в `Hero`) на `var(--decor-*)` / `currentColor`, кроме цветов canvas в `globeRenderer.ts`; проверить сценарий «Конфетти» из `specs/design-system`
- [ ] 3.5 Добавить в README раздел «Стили»: Tailwind + CSS Modules, слои токенов в `globals.css`, правило D2 «один элемент — один способ стилизации», где лежат примитивы; проверить, что пути и команды в разделе существуют

## 4. Шкалы

- [ ] 4.1 Проверить, работает ли в CSS Modules `@reference "@/app/globals.css"` + `@media (width >= --theme(--breakpoint-md))` в `next dev` и `next build`; зафиксировать результат в design.md (D5: основной или запасной вариант)
- [ ] 4.2 Задать в `@theme` брейкпоинты `xs 375`, `sm 640`, `md 768`, `lg 980`, `xl 1240` и перевести на них все медиазапросы модулей (374/479/519 → `xs`/`sm`); сверить раскладку на 375/768/1280
- [ ] 4.3 Задать радиусы (`--radius: 12px` и производные) и шрифты (`--font-sans`, `--font-hand`), перевести литералы `border-radius` в модулях на шкалу; проверить grep по `border-radius: [0-9]` (остаются только `50%` и составные формы) и скриншоты
- [ ] 4.4 Ввести типографические токены (`--text-display`, `--text-title`, `--text-heading` и шкалу Tailwind) и перевести на них `font-size` в модулях; проверить, что карточка отеля на глобусе и слот-машина не переносятся и не обрезаются на 375 px

## 5. Фокус

- [ ] 5.1 Удалить глобальное `:focus, :focus-visible { outline: none }`, добавить `:focus-visible` ring на `--ring` в `@layer base` и проверить Tab-обходом, что фокус виден в шапке, форме, карточках направлений, ассистенте, барабане, на пинах глобуса и в календаре, а после клика мышью по кнопке кольца нет (сценарии «Видимый фокус» из `specs/design-system`)

## 6. Примитивы

- [ ] 6.1 Добавить через `npx shadcn@latest add` компоненты `button`, `input`, `textarea`, `label`, `badge`, `card`, `field`; проверить `npm run typecheck` и `npm run lint`
- [ ] 6.2 Настроить варианты Button под D7 (`default` с `--primary-hover`, `secondary`, `ghost`, `outline`, `link`; размеры `sm`, `default`, `lg`, `icon`, `icon-sm`; `shape: pill`) и Badge (`secondary`, `destructive`, `success`); проверить состояния hover и disabled на временной странице или в dev-режиме, затем удалить временную страницу

## 7. Перевод компонентов

- [ ] 7.1 Header: иконки-кнопки и `panelAction` → Button, оболочка панели → Card; проверить сценарии `specs/site-header`
- [ ] 7.2 SearchForm: «Найти отель», `popoverDone`, степперы, стрелки календаря, «Очистить направление» → Button; ошибки полей → FieldError с прежними `id`; поле направления — классы Input; блок результатов → Card; проверить сценарии `specs/manual-search`
- [ ] 7.3 AssistantSearch: «Отправить», «Заново», чипы → Button; поле запроса → Textarea; «выше бюджета» и рейтинг → Badge; проверить сценарии `specs/assistant-search`
- [ ] 7.4 RandomSearch: поле имени → Input + Label, ошибка → FieldError (`role="alert"` сохраняется), «Крутить барабан», «Изменить», «Поделиться», «Ещё раз» → Button, билет → Card; проверить сценарии `specs/random-search`
- [ ] 7.5 HomePage и Hero: «Смотреть все» → Button `link`/`ghost`, бейдж «Новый отель» → Badge; `DestinationCard`, пины и карточку отеля на глобусе оставить в модулях на токенах; проверить сценарии `specs/home-page` и `specs/hero-globe`; дополнить раздел README «Стили» списком примитивов и вариантов Button
- [ ] 7.6 Удалить из модулей правила, которые после перевода никто не использует; проверить, что каждое имя класса в `*.module.css` используется в TSX, а `npm run build` проходит

## 8. Итоговая проверка

- [ ] 8.1 Пройти все сценарии `openspec/specs/*` и `specs/design-system` вручную на 375 и 1280 px, сравнить со скриншотами 1.1, прогнать `npm run typecheck && npm run lint && npm run build`, `openspec validate design-system-foundation --strict`

## Workflow follow-up

- Архивировать change после ревью (`/opsx:archive`), чтобы `design-system` попал в `openspec/specs/`.
- Следующий change — `migrate-composite-components`.
