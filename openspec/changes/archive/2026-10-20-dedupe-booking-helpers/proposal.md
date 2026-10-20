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

## Решения

- Тексты двух прежних хелперов расходились форматом даты и случаем без дат. Спецификации задают лишь «Бесплатная отмена до <дата>» / «Невозвратный тариф», поэтому видимые тексты каждой страницы сохранены. Единый `cancellationLabel(cancellation, checkIn, { short })` в `src/lib/booking.ts`: страница тарифов передаёт `short: true` («до 29 октября») и, пока даты не выбраны, `checkIn = null` («Бесплатная отмена за 3 дня до заезда»); оформление, подтверждение и поездки — длинная дата.
- `effectiveCancellation(rate, checkIn, today)` принимает тариф и дату заезда (а не предложение), чтобы страница тарифов тоже показывала просроченную бесплатную отмену как невозвратный тариф.
- `formatRating` переименован в `formatDecimal`: он форматирует и рейтинг, и расстояние.
- `BookingDetails` получает `leadingRows` (номер, создание, статус, отмена) и `cancellationTerm`: подписи строки отмены («Отмена» / «Условия отмены») остались прежними.
- `destructive` у `ui/button`: `bg-destructive text-white hover:bg-destructive/90` по образцу shadcn; цвет кнопки подтверждения отмены — единственное видимое изменение.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/lib/{booking,rates,format}.ts`, `src/components/RatesPage/*`, `src/components/SearchResultsPage/HotelCard.tsx`, `src/components/StayBar/useStay.ts`, `src/components/BookingConfirmation/*`, `src/components/Trips*/*` или `BookingDetails*`, `src/components/ui/button.tsx`.
- Источник: TODO, «Предложения».
