# Proposal

## Why

Находки `reduce-globe-css` и `add-help-and-legal-pages` (TODO, «Предложения») и решения пользователя 2026-10-20:
- наведение везде через `hover:` (только устройства с наведением); сейчас `Hero` использует `[&:hover]` (`src/components/Hero/Hero.tsx:90`), из-за чего у выбранного пина нужен `!`;
- остатки произвольных свойств там, где есть стандартные утилиты: `transform: translateY(…)` в `style` ленты барабана (`src/components/SearchPanel/RandomSearch.tsx:316`), `[transition:…]` (`src/components/SearchForm/GuestsField.tsx:49`, `src/components/DestinationCard/DestinationCard.tsx:18`, `:24`, `:42`);
- `ui/accordion` без анимации раскрытия: классы `animate-accordion-*` убраны, keyframes нет;
- устаревший комментарий про фон `html` после появления подвала (`src/app/globals.css:282`).

## What Changes

- `[&:hover]` в `Hero` заменить на `hover:`; убрать `!`, который был нужен только из-за порядка произвольных вариантов. На тач-устройствах касание пина и карточки больше не показывает состояние наведения (фокус и выбор работают как раньше).
- Сдвиг ленты барабана — утилита `translate-y-(--…)` с CSS-переменной в `style`; переходы — стандартные утилиты `transition-*`, `duration-*`, `ease-*`.
- Анимация аккордеона: `--animate-accordion-down`/`--animate-accordion-up` с `@keyframes` в `@theme` (высота из `--accordion-panel-height` Base UI), вернуть классы в `ui/accordion`; учесть `prefers-reduced-motion`.
- Правило README «Стили» дополнить: наведение — `hover:`; `transition` и сдвиги через `style` — стандартными утилитами с CSS-переменными.
- Уточнить комментарий в `globals.css`.

Поведение на устройствах с мышью не меняется; delta-спецификаций нет (`skip_specs: true`): `hero-globe` описывает наведение без различения тача.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/components/Hero/*`, `src/components/SearchPanel/RandomSearch.tsx`, `src/components/SearchForm/GuestsField.tsx`, `src/components/DestinationCard/*`, `src/components/ui/accordion.tsx`, `src/app/globals.css`, `README.md` («Стили»).
- Источник: TODO, «Предложения»; решение пользователя 2026-10-20 (наведение — `hover:`).

## Решения

- Пин `Hero` с несколькими свойствами `transition` и разной длительностью записан списками значений утилит: `transition-[scale,width,height,color] duration-[600ms,700ms,700ms,400ms] ease-[cubic-bezier(…),…,ease]` — вычисленный `transition` тот же, что был у `[transition:…]`.
- Остальные `[transition:…]` (`DestinationCard`, `GuestsField`) — те же утилиты с одной длительностью (`duration-250`, `duration-500`, `duration-200`), `ease-in-out` = `cubic-bezier(0.4,0,0.2,1)`.
- Лента барабана: `translate-y-(--shift)`, `--shift` = `0%` в покое и `-(n-1)/n·100%` при вращении; `transition-[translate]` вместо `transition-transform`, потому что утилита сдвига меняет свойство `translate`.
- Аккордеон: анимации на панели Base UI (`data-open:animate-accordion-down`, `data-closed:animate-accordion-up`, `motion-reduce:animate-none`); при закрытии у панели нет `data-open`, поэтому используется `data-closed`. Высота внутреннего блока (`h-(--accordion-panel-height)`, `data-*-style:h-0`) убрана: её даёт анимация панели.
- Комментарий в `globals.css`: фон `html` — фон страницы, на котором стоит подвал без своей заливки.
