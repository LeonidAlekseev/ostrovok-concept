# Proposal

## Why

Решение пользователя 2026-10-19: во всех компонентах отказываемся от своего CSS в пользу Tailwind и shadcn. Рост размера CSS сборки не блокирует перевод: переиспользование утилит окупается в долгой перспективе. Прежний критерий «gzip CSS не больше +2 %» отменён.

После `reduce-search-css` своих модулей осталось три:
- `src/components/Hero/Hero.module.css` (387 строк) — эффекты глобуса и связанные правила;
- `src/components/SearchPanel/RandomSearch.module.css` — `@keyframes` слот-машины и конфетти с классами запуска;
- `src/components/SearchPanel/AssistantSearch.module.css` — `@keyframes dot` с классом запуска.

Пока модули читают токены темы во время выполнения, `@theme` в `src/app/globals.css` объявлен `static`, и в сборку попадают все токены, включая неиспользуемые.

Правило README «Стили» для `translate`/`scale`/`box-shadow` (записано в `reduce-search-css`) выбирает произвольные свойства (`[translate:…]`) ради размера CSS. Без критерия размера это правило теряет основание.

## What Changes

- Перевести стили `Hero` (`Hero.tsx`, `StatsPanel.tsx` и связанные компоненты) на утилиты Tailwind и примитивы shadcn.
- Перенести все `@keyframes` из модулей в `@theme` в `globals.css` как `--animate-*` с `@keyframes` внутри `@theme`; запуск анимаций — утилитами `animate-*`. Где подходит, использовать готовые анимации `tw-animate-css`.
- Удалить все три `*.module.css`. Цель — ни одного своего CSS-модуля в `src/components`.
- Убрать `static` у `@theme`. Токены, которые нужны во время выполнения (например, через `style` или `var()` в утилитах), Tailwind должен видеть в коде; иначе вынести значение в `:root`. Выбор записать в design.md.
- Новое правило для `translate`/`scale`/`rotate`/`box-shadow`: стандартные утилиты Tailwind (`translate-*`, `scale-*`, `rotate-*`, `shadow-*`, `shadow-(--…)`); произвольное свойство — только когда утилиты нет. Привести к правилу все компоненты: `HomePage`, `DestinationCard`, `TravelBanner`, `Header`, `Hero`, `SearchForm`, `SearchPanel`, `RandomSearch`, `AssistantSearch`. Анимации `tw-animate-css` (`animate-in`, `zoom-in-*`, `slide-in-*`) входят в правило как стандартные утилиты.
- Обновить README, раздел «Стили»: модулей нет, правило утилит, анимации в `@theme`.
- Размер CSS до и после записать для информации; порога нет.

Поведение не меняется, delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/components/Hero/*`, `src/components/SearchPanel/{RandomSearch,AssistantSearch}.*`, `src/app/globals.css` (`@theme`, `:root`).
- Файлы, приводимые к правилу: `src/components/HomePage.tsx`, `DestinationCard/*`, `TravelBanner/*`, `Header/*`, `SearchForm/*`, `SearchPanel/*`.
- `README.md`, раздел «Стили».
- Источник: TODO, «Предложения», пункты 6–7; решение пользователя 2026-10-19.
