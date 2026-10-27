## Why

Две правки пользователя. Первая: 16 настоящих отелей Валенсии стоят вне загруженных карт шума EEA (у аэропорта Манисес, в Патерне, Куарт-де-Поблете, Алакуасе и Альфафаре): раздел «Шум и окружение» говорит им «Нет данных EEA», и такие отели портят выдачу города. Их нужно скрыть везде, не удаляя данных. Вторая: окно отеля поверх результатов поиска мешает. Карточка и метка на карте должны сразу вести на страницу отеля, а «Назад» браузера или жест на телефоне — возвращать поиск ровно в то же место.

## What Changes

- SQL-функция `hotels_outside_noise()` перечисляет настоящие отели, в точке которых нет ни одного контура `geo_noise`. Это тот же признак, по которому `hotel_geo().noise` пуст и страница пишет «Нет данных EEA». Загрузчики каталога (`src/lib/db/catalog.ts`) и поиск по смыслу (`semanticSearch`) отбрасывают такие отели. Они пропадают из выдачи, карты, подборок, с главной, из Эвала, вайба, звёзд и «Нарисуй». Их страница и `/rooms` отвечают 404, API отеля возвращает `null`. Строки в базе остаются.
- **BREAKING** Окна отеля на `/search` больше нет. Метка на карте ведёт на `/hotels/<id>` с датами и гостями поиска на любой ширине, карточка ведёт туда же, как и раньше. Старая ссылка с `?hotel=<id>` открывает страницу отеля вместо результатов.
- «Назад» на поиск восстанавливает: адрес (запрос, даты, фильтры, страницу), прокрутку страницы после загрузки результатов, режим «Список/Карта», центр и масштаб карты, а открытый отель подсвечивается в списке и на карте. Состояние хранится по записи истории: id в `history.state`, значения в `sessionStorage` (`search-views`). Новая запись того же поиска начинается сверху.
- Исправлено: при возврате на `page=2` список больше не прокручивается к заголовку результатов.
- Удалён мёртвый код окна: `HotelDialog`, `useHotelDetails`, `GET /api/hotels/<id>/details`, режим окна в `HotelPage`, `HotelHeader`, `HotelTabs` и `HotelStay`, `useLocalStay`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `search-results-page`: отель открывается своей страницей, «Назад» возвращает к тому же месту; окна отеля нет.
- `hotel-page`: нет режима окна на поиске и деталей для него.
- `hotel-catalog`: отели вне карт шума скрыты.
- `browser-state`: состояние поиска по записи истории в `sessionStorage`.

## Impact

- База: миграция `20261027120000_hotels_outside_noise.sql` (только функция, без таблиц), `database.types.ts`.
- Код: `src/lib/db/catalog.ts`, `src/lib/ai/semantic.ts`, `src/components/SearchResultsPage/{SearchResultsPage,ResultTile,searchView}.ts(x)`, `src/components/HotelPage/{HotelPage,HotelHeader,HotelTabs,HotelStay,goToSection,ShareButton}`, `src/components/StayBar/useStay.ts`. Удалены `HotelDialog.tsx`, `useHotelDetails.ts` и `src/app/api/hotels/[hotelId]/details/route.ts`.
- Тесты: `catalog.test.ts`, `semantic.test.ts`, `SearchResultsPage.back.test.tsx` (бывший `dialog`), `bar`, `HotelPage.test.tsx`.
