# Proposal

## Why

`migrate-composite-components` переводит виджеты на Base UI (17 из 18 задач выполнено). Контракты из `openspec/specs` могли сломаться при переводе: Escape в поле направления должен закрывать только список (`manual-search`, сценарий «Escape»); клик вне и Escape закрывают всплывающие слои (`site-header`); панели режимов остаются смонтированными при переключении вкладок (`search-modes`).

## What Changes

- Проверить каждый контракт тестом, написанным по сценарию спецификации.
- Исправить расхождения, найденные проверкой.

Требования спецификаций не меняются: проверяется соответствие текущим требованиям (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- Тесты компонентов в `src/components/**/*.test.tsx`.
- Возможные правки в `src/components/ui/*` и виджетах, если контракт нарушен.
- Зависит от `add-unit-tests` (раннер) и от завершения `migrate-composite-components`.
