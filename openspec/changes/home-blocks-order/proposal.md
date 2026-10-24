## Why
Решение пользователя 2026-10-24: новый порядок и названия блоков на главной — «Нарисуй свой отдых», «Это твой вайб», «Звёзды подскажут».

## What Changes
- Порядок секций после подборок по персонам: `#draw` → `#vibe` → `#stars` → баннер `#explore` (`src/components/HomePage.tsx`).
- «Нарисуй своё путешествие» → «Нарисуй свой отдых»: заголовок секции и заголовок окна (`DrawSearch.tsx`, `DrawSearchDialog.tsx`).
- «Поиск по звёздам» → «Звёзды подскажут»: заголовок секции, окна и подпись видео (`StarSearch.tsx`, окно, `StarVideo.tsx`), комментарий `horoscope.ts`.
- «Поиск вайба» → «Это твой вайб» переименовывает `vibe-block-redesign` (он владеет блоком, окном и картинкой вайба); этот change его не трогает.
- README и specs с прежними названиями обновляются.

## Impact
- `HomePage.tsx`, `DrawSearch/*`, `StarSearch/*`, README, тесты. Specs `home-page`, `draw-search`, `star-search`.
- Зависит от `vibe-block-redesign` (общий `HomePage` и порядок с `#vibe`) и `drop-draw-hint` (общий `DrawSearchDialog.tsx`).
