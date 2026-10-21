# Proposal

## Why

Решения пользователя 2026-10-21 по «Предложениям» TODO: 39 (оценка с запятой), 40 (гости без дат), 41 (оставить «Избранное», добавить в меню уведомления и аккаунт), 42 (самый дешёвый отель), 44 (лента фото без остановки Tab). По 43 — подложка счётчика и звёзд остаётся цветом палитры Tailwind, менять не нужно.

## What Changes

- Сводная оценка в отзывах — «9,1» (`formatDecimal`), как везде.
- Выбор гостей на странице отеля без дат сохраняет только гостей, даты не подставляются.
- Меню разделов: «Избранное» остаётся; добавлены «Уведомления» (открывает панель уведомлений) и «Аккаунт» (гость — на `/login`, вошедший — меню аккаунта).
- Ассистент: если ни один отель не укладывается в бюджет, предлагается самый дешёвый.
- Лента фото `PhotoCarousel` не получает фокус с клавиатуры: Tab идёт сразу к стрелкам.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `hotel-page`, `site-header`, `assistant-search`, `hotel-tile`.

## Impact

- `src/components/HotelPage/Reviews.tsx`, `src/components/StayBar/useStay.ts`, `src/components/Header/{Header,UserMenu}.tsx`, `src/lib/assistant.ts`, `src/components/PhotoCarousel/PhotoCarousel.tsx`.
