# Proposal

## Why

Решения пользователя 2026-10-20 по находкам исполнителей: 32а, 33а, 35а.

## What Changes

- Знаки зодиака в круге блока «Поиск по звёздам» остаются вертикальными, пока круг вращается (32а).
- В горизонтальной ленте подборок на главной фото карточек листаются только стрелками, свайп листает ленту (33а). В остальных местах свайп по фото работает как сейчас.
- Ассистент считает сумму поездки и бюджет по цене с выходными (`stayTotal`), как при оформлении (35а).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `star-search`: знаки зодиака.
- `home-page`: фото в подборках.
- `assistant-search`: сумма поездки.

## Impact

- `src/components/StarSearch/ZodiacRing.tsx`, `src/components/PhotoCarousel/PhotoCarousel.tsx` (проп без свайпа), `src/components/HomeCollections/HomeCollections.tsx`, `src/lib/assistant.ts`.
- После `rework-hotel-page` (он может менять `PhotoCarousel`) и `switch-hand-font`.
