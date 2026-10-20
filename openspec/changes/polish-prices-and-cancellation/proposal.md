# Proposal

## Why

Решения пользователя 2026-10-20 по находкам `rework-hotel-tile`: «"От" убрать везде», «Бесплатная отмена надо убрать у половины отелей».

## What Changes

- Убрать «от» перед ценами во всём интерфейсе: маркер и краткая карточка карты `/search`, карточки направлений, подсказки направления, карточка глобуса, номера на странице отеля, ассистент, результат и видео гадания. Фильтр «от 9» и «от 18 лет» не цены — остаются.
- Половина отелей каталога без бесплатной отмены: все тарифы невозвратные. Метка «Бесплатная отмена» на карточке перестаёт стоять везде.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `design-system`: цены без «от».
- `home-page`, `manual-search`, `hero-globe`, `star-search`, `search-results-page`: формулировки цены.
- `hotel-catalog`: отели без бесплатной отмены.

## Impact

- `src/components/SearchResultsPage/SearchMap.tsx`, `DestinationCard`, `Hero/Hero.tsx`, `StarSearch/starVideo.ts` и результат гадания, `SearchPanel/AssistantSearch.tsx`, `HotelPage/RoomList.tsx`, подсказки `DestinationField`.
- `src/lib/catalog.ts` (генерация тарифов). Меняются данные: подборка «Бесплатная отмена», фильтр `free_cancel` и тесты, завязанные на тарифы конкретных отелей.
