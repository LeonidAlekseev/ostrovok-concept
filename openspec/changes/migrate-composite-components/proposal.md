# Proposal

## Why

Change `design-system-foundation` ввёл Tailwind, shadcn-примитивы и семантические токены, но составные виджеты остались на собственных CSS Modules и ручной ARIA-разметке: combobox направления, поповеры дат и гостей, панели шапки, вкладки способа поиска и сетка знаков зодиака (radiogroup). Они держат фокус, стрелочную навигацию и `aria-*` вручную, и при каждом изменении дизайна их приходится править отдельно. Перевод на Base UI (`@base-ui/react`, уже в зависимостях) отдаёт клавиатуру и роли библиотеке и делает эти виджеты такими же, как примитивы.

## What Changes

- Combobox направления (`DestinationField`) переводится на Base UI Combobox с прежним списком подсказок, тем же текстом и тем же поведением выбора.
- Поповеры дат (`DateField`, `Calendar`) и гостей (`GuestsField`) переводятся на Base UI Popover. Календарь сохраняет роving-focus и стрелочную навигацию по дням; для этого используется Base UI-примитив или ручная логика внутри Popover, выбор в design.md.
- Панели шапки (`Header`) переводятся на Base UI Popover; закрытие по клику вне и по Escape берётся у библиотеки, `useDismiss` удаляется, если больше не используется.
- Вкладки способа поиска (`SearchPanel`) переводятся на Base UI Tabs; роли `tablist`, `tab`, `tabpanel` и связка `aria-controls` остаются прежними.
- Сетка знаков зодиака (`RandomSearch`, role `radiogroup`) переводится на Base UI Radio Group с теми же вариантами и подписями.
- Визуал (палитра, радиусы, фокус, тени) этих виджетов переводится на токены и примитивы из `design-system`; модульные классы остаются только для раскладки.
- **Без поведенческих изменений**: тексты, роли, ARIA-атрибуты, порядок табуляции и клавиатурные сценарии остаются прежними.

## Capabilities

### New Capabilities
- `composite-widgets`: составные виджеты интерфейса (combobox, поповеры, вкладки, radiogroup) построены на Base UI и сохраняют прежнее поведение, роли и клавиатурные сценарии.

### Modified Capabilities
<!-- Нет: поведение существующих capabilities (search-modes, manual-search, random-search, site-header, assistant-search) не меняется. Требования к фокусу и состояниям уже покрыты design-system. -->

## Impact

- **Код:** `src/components/SearchForm/{DestinationField,DateField,GuestsField,Calendar}.tsx`, `src/components/Header/Header.tsx`, `src/components/SearchPanel/SearchPanel.tsx`, `src/components/SearchPanel/RandomSearch.tsx`, `src/hooks/useDismiss.ts` (удаление, если не останется вызовов), соответствующие `*.module.css`.
- **Зависимости:** `@base-ui/react` уже объявлен; новых пакетов не ожидается.
- **Риски:** различия Base UI в фокусе, порядке табуляции, закрытии поповеров и разметке (`data-*`, порталы) могут изменить поведение; состав и порядок проверяется по сценариям spec. Подробности — в design.md.
