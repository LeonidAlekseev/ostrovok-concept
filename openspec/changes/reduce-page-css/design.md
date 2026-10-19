# Design

## Context

Продолжение `reduce-custom-css` (архив). Метод и метрики те же. Компоненты этого change не пересекаются по файлам с `Hero`, поэтому `reduce-hero-css` идёт отдельно и может выполняться параллельно.

## Goals / Non-Goals

**Goals:**
- Суммарный размер CSS сборки не растёт, замеры до и после записаны.
- Визуал четырёх компонентов сохраняется в пределах допустимых отклонений.

**Non-Goals:**
- `Hero` и глобус.
- Изменение токенов дизайн-системы и `globals.css`.
- Изменение разметки и поведения сверх замены классов.

## Decisions

**Метрика — суммарный размер `.next/static/chunks/*.css` после `npm run build`**, сырой и gzip −9, как в `reduce-custom-css`.

**Скриншоты по методике `reduce-custom-css`:** headless Chromium, viewport 1280×900 и 390×844, `prefers-reduced-motion: reduce`, глобус скрыт, время и `Math.random` зафиксированы, сравнение pixelmatch с threshold 0.1. Состояния: главная целиком, карточка направления (обычная и hover), баннер, `SmartImage` до и после загрузки изображения. Скриншоты кладутся в `openspec/changes/reduce-page-css/screenshots/{before,after,diff}`.

**Порядок:** `SmartImage`, `DestinationCard`, `TravelBanner`, `HomePage`. Каждый компонент — отдельный коммит.

## Risks / Trade-offs

- [Длинные строки классов в JSX] → Принято, как в `reduce-custom-css`.
- [Потеря hover и focus-состояний при переносе] → Снимать состояния на скриншотах.
- [Сетки и брейкпоинты `HomePage` расходятся с исходными] → Сравнивать оба viewport.

## Migration Plan

Компонент за компонентом, каждый коммит проходит сборку. Откат — возврат коммита компонента.

## Open Questions

Нет.
