## Why

Этап A2 Travel OS (95а): каталог будет читаться из Supabase на сервере. Сейчас около 20 модулей синхронно берут глобальный каталог из `src/lib/catalog.ts` (`hotels`, `getHotel`, `hotelsIn`, `fullHotelsIn`, `getDestination`, `newHotels`, `destinations`), в том числе клиентские. Чтобы сменить источник, сначала расчёты должны получать отели аргументом. Источник в этом change не меняется.

## What Changes

- Модули расчётов принимают данные каталога аргументом и не импортируют глобальные списки: `results.ts`, `vibe.ts`, `horoscope.ts`, `assistant.ts`, `offer.ts`, `collections.ts`, `trips.ts`.
- Компоненты получают отели и направления от страницы (серверного компонента) пропсами или из одного места доступа к каталогу; глобальные `hotels`, `getHotel`, `hotelsIn`, `fullHotelsIn`, `getDestination`, `newHotels` остаются только в модуле доступа к каталогу (`src/lib/catalog.ts` или новый `src/lib/catalogSource.ts`) и в тестах.
- Клиентские места, которым нужен отель по `id` из `localStorage` (избранное, поездки, бронь), получают его через один хук/функцию доступа — следующий change заменит её на запрос к серверу.
- Поведение, разметка и тесты не меняются (кроме сигнатур в тестах). Размер JS главной не растёт.

## Impact

`src/lib/{results,vibe,horoscope,assistant,offer,collections,trips,catalog}.ts`, страницы `src/app/**`, компоненты `SearchResultsPage`, `VibeSearch`, `StarSearch`, `Favorites`, `Trips`, `BookingPage`, `BookingDetails`, `HotelPage`, `HotelTile`, `StayBar`, `HomeCollections`, тесты. Спека `hotel-catalog`.
