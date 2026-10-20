# Proposal

## Why

Решения пользователя 2026-10-20 по находкам этапа карточки отеля и поиска по звёздам: 5а, 8а, 9а, 12б, 13а.

## What Changes

- Избранное: ссылки на отель со стартовыми датами (завтра — послезавтра, 2 взрослых, 1 номер), как в подборках (5а).
- `HotelTile`: бейдж оценки гостей `h-6 text-sm` (8а).
- Результат гадания: запасные отели в одну колонку на телефоне, две — от `sm` (9а).
- Видео: при скрытии вкладки запись ставится на паузу и продолжается при возврате; анимация идёт по времени записи, а не по часам, поэтому в видео нет застывших кадров (12б).
- Анкета гадания: дата заезда — поле даты и календарь поиска (`SearchForm/DateField`, `Calendar`) вместо нативного `type="date"` (13а).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `favorites`: ссылка с датами.
- `star-search`: поле даты заезда, запись видео в скрытой вкладке.

## Impact

- `src/components/Favorites/FavoritesPage.tsx`, `src/components/HotelTile/HotelTile.tsx`, `src/components/StarSearch/StarResult.tsx`, `StarForm.tsx`, `StarVideo.tsx`, `src/lib/shareMedia.ts`.
- Не пересекается с `improve-search-map` (`SearchResultsPage/*`).
