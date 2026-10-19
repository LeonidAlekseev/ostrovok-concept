# Design

## Context

Модули в `src/lib/` — чистые функции без React и DOM. Проект на ESM и TypeScript 6, сборка через Next 16. См. proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Тесты запускаются одной командой `npm test` и проходят на текущем коде.
- Тесты рядом с модулями.

**Non-Goals:**
- Тесты React-компонентов (это `verify-base-ui-contracts`).
- Покрытие 100%.

## Decisions

**Vitest.** Он работает с ESM и TypeScript без отдельной конфигурации трансформации. Альтернатива Jest требует настройки трансформера для TypeScript и ESM, это лишний конфиг.

**Окружение `node`.** Тестируемые модули чистые, DOM не нужен.

**Фиксация «сегодня» через fake timers** (`vi.setSystemTime`) для тестов `todayIso` и `validateSearch`, чтобы тесты не зависели от даты запуска.

**Файлы `*.test.ts` рядом с модулями.** Так тест находится рядом с кодом.

## Risks / Trade-offs

- [Тесты закрепят баги] → Тесты описывают текущее поведение; баги помечаются в тестах и исправляются отдельными changes (например, `fix-destination-scenario-search`).

## Migration Plan

Откат — удалить зависимость и тестовые файлы.

## Open Questions

Нет.
