## 1. Логика броней

- [x] 1.1 `src/lib/trips.ts`: `tripBooking` без личных полей, `quoteDateChange` (цена тарифа как при бронировании, условия отмены, проверки дат), `applyDateChange`, `parseDateChange`
- [x] 1.2 `Brief.trips`, `Brief.bookingId`, `AssistantRequest.bookings`, `AssistantResponse.change`, агент шага `trips`

## 2. Сервер

- [x] 2.1 `src/lib/ai/bookingTools.ts`: «Бронирования» и «Пересчёт при смене дат» по контракту `ToolResult`
- [x] 2.2 `src/lib/ai/bookingTurn.ts`: план (модель + правила дат и номера брони), ответ модели по данным запуска, правила без модели
- [x] 2.3 `/api/assistant`: zod-схема `TripBooking`, ветка `brief.trips`, запись `tool_runs` через `recordRun`
- [x] 2.4 `/api/docs`: схема и пример `assistant-trips` (живой ответ dev-сервера)

## 3. Браузер

- [x] 3.1 `useChats`: контекст поездок, брони в запросе, карточка предложения, `confirmChange`
- [x] 3.2 `EvalChat` — общий виджет карточки отеля и панели поездок; `HotelAssistant` на нём
- [x] 3.3 `TripsAssistant`: плавающая кнопка и боковая панель на `/trips` и `/trips/booking`
- [x] 3.4 После оформления — `/trips?new=<номер>` с подсветкой; страница подтверждения и её тесты удалены

## 4. Проверка

- [x] 4.1 Тесты: расчёт и применение смены дат, разбор дат, ход, маршрут, панель с «Подтвердить», подсветка новой брони
- [x] 4.2 Живой сценарий: забронировать → «Мои поездки» → вопрос о брони → смена дат → «Подтвердить»
- [x] 4.3 README, docs/tools.md
