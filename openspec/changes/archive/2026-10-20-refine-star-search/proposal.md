# Proposal

## Why

Решения пользователя 2026-10-20: 4а, 5а и запись видео в Safari — пауза при скрытой вкладке прерывает запись. Вместо паузы: при возврате на вкладку записывать заново и предупреждать «не сворачивайте вкладку».

## What Changes

- Запись видео: если вкладка скрылась во время записи, запись прерывается; при возврате автоматически начинается заново с начала. Пауза `MediaRecorder` (`pause`/`resume`) удаляется.
- Предупреждение: на время записи — «Не сворачивайте вкладку, пока идёт запись»; после перезапуска — «Запись прервалась — начали заново. Не сворачивайте вкладку» (`role="status"`).
- Календарь даты заезда в анкете (`DateField` в режиме `single`) — один месяц; пояснение про 2 ночи связано с полем через `aria-describedby` (проп `describedBy` у `DateField`) (4а).
- `StarSearchDialog.tsx` берёт стартовую дату через `startStay`; недостижимая проверка `checkIn < today` в `StarForm` убирается или остаётся с комментарием-обоснованием (смена суток) — решает исполнитель (5а).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `star-search`: запись видео при скрытой вкладке.

## Impact

- `src/lib/shareMedia.ts`, `src/components/StarSearch/StarVideo.tsx`, `starVideo.ts`, `StarForm.tsx`, `StarSearchDialog.tsx`, `src/components/SearchForm/DateField.tsx` (и `Calendar.tsx`, если нужно для одного месяца).
- Не пересекается с `refine-hotel-dialog`.
