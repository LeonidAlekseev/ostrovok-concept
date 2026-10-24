## Why
В каталоге Supabase два вида отелей: настоящие отели Валенсии из выдачи Островка (`id` вида `ota-<master_id>`, #170) и синтетические отели остальных направлений (`src/lib/catalogGenerator.ts`). Решение пользователя 2026-10-24: синтетические данные остаются в Supabase, но в production их не видно; у синтетических отелей — плашка `generated`.

## What Changes
- **Один признак** «синтетический отель» в слое каталога (`src/lib/db/catalog.ts` / `src/lib/catalog.ts`): настоящие — только отели Островка (`ota-*`), остальные — синтетические. Признак определяется в одном месте; все читатели каталога берут видимость оттуда.
- **Production** (`isProduction` из `src/lib/env.ts`, на Vercel — `VERCEL_ENV === 'production'`): слой каталога отдаёт только настоящие отели. Направления без видимых отелей скрываются (в production остаётся Валенсия), сценарии без направлений — тоже.
- **Где это видно** — всё, что читает каталог: пины и карточки отелей на глобусе (`Hero`, `cities`, `newHotels`, `featured`), подборки по персонам, поиск и выдача `/search` с картой, `GET /api/hotels`, помощник (`/api/assistant`, поиск по смыслу — кандидаты только видимых отелей), вайб, звёзды, «Нарисуй», избранное.
- **Страницы синтетических отелей** в production — 404 (`/hotels/<id>`, `/hotels/<id>/rooms`), в статический пререндер не попадают. Брони и избранное в `localStorage` со ссылкой на скрытый отель не ломают страницы `/trips` и `/favorites`.
- **Вне production** (preview, `next dev`) видны все отели; у синтетического отеля везде, где он показан, — маленькая полупрозрачная плашка `generated`: на странице отеля, на карточке `HotelTile` (выдача, подборки, избранное, вайб и др.), в окне отеля на `/search`. Решение пользователя 2026-10-24.
- Данные в Supabase не удаляются и не меняются.

## Impact
- Высокий риск: кросс-модульная видимость данных, разное поведение сборок. Файлы: `src/lib/db/catalog.ts`, `src/lib/catalog.ts`, `src/lib/env.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/hotels/**`, `src/app/api/{hotels,assistant}`, `src/lib/ai/semantic.ts`, `src/components/{StarSearch,VibeSearch}/actions.ts`, `Hero`, `HotelPage`, `HotelTile`, тесты.
- Specs: `hotel-catalog`, `hero-globe`, `hotel-page`, `hotel-tile`.
