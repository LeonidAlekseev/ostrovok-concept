# Proposal

## Why

Находки исполнителей шаблонов страниц (TODO, «Предложения»):
- дубли хелперов: `cancellationText` (`src/components/RatesPage/RoomRates.tsx:16`) и `cancellationLabel` (`src/lib/booking.ts`) с разными текстами; локальная `decimal` (`src/components/SearchResultsPage/HotelCard.tsx:25`) и `formatRating` (`src/lib/format.ts`); `DEFAULT_GUESTS` в `src/components/StayBar/useStay.ts:9` и `src/lib/search.ts`;
- список деталей бронирования почти одинаков на подтверждении (`src/components/BookingConfirmation/ConfirmationPage.tsx:14`) и в «Моих поездках» (`BookingDetailsPage`);
- у `ui/button` нет варианта `destructive`, подтверждение отмены бронирования — в основном стиле.

## What Changes

- Один хелпер текста условий отмены в `src/lib/*` для тарифов, оформления, подтверждения и поездок; тексты согласовать со спецификациями `rate-selection`, `booking-confirmation`, `trips`.
- Один форматтер десятичных чисел с запятой в `src/lib/format.ts` для рейтинга и расстояния.
- `useStay` импортирует `DEFAULT_GUESTS` из `src/lib/search.ts`.
- Общий компонент `BookingDetails` с дополнительными строками для подтверждения и деталей поездки.
- Вариант `destructive` в `ui/button` (по образцу shadcn) для кнопки подтверждения отмены.

Видимые тексты, совпадающие со спецификациями, не меняются; delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/lib/{booking,rates,format}.ts`, `src/components/RatesPage/*`, `src/components/SearchResultsPage/HotelCard.tsx`, `src/components/StayBar/useStay.ts`, `src/components/BookingConfirmation/*`, `src/components/Trips*/*` или `BookingDetails*`, `src/components/ui/button.tsx`.
- Источник: TODO, «Предложения».
