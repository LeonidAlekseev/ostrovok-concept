# Proposal

## Why

Решения пользователя 2026-10-20 по находкам этапа карты: 1а, 2б, 3а.

## What Changes

- Окно отеля получает те же даты и гостей, что список: при `/search` без дат в адресе — стартовые даты, а не «без дат» (1а).
- Смена дат и гостей в окне меняет их только в окне: поиск, адрес `/search` и список не меняются, список не перезагружается. «Открыть страницу отеля» ведёт с датами окна (2б).
- Две колонки списка только от `2xl` (1536 px), до этого одна (3а).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `search-results-page`: даты в окне отеля, порог сетки.

## Impact

- `src/components/SearchResultsPage/HotelDialog.tsx`, `SearchResultsPage.tsx`, `src/components/HotelPage/HotelPage.tsx`, `HotelStay.tsx`, `src/components/StayBar/useStay.ts`.
- `src/components/SearchForm/DateField.tsx` не менять: его параллельно меняет `refine-star-search`.
