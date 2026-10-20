# Proposal

## Why

Решения пользователя 2026-10-20 по находкам этапа: 10а (README и spec дизайн-системы описывают удалённую слот-машину, токен `--decor-machine-indigo`) и 14а (мелкие технические правки).

## What Changes

- README: разделы о режимах поиска и `fortune.ts` — на поиск по звёздам (`src/lib/horoscope.ts`, видео) и поиск вайба (`src/lib/vibe.ts`, картинка); упоминания слот-машины и конфетти убраны; заметка к `scripts/screenshots.mjs`: `npx next start` порождает дочерний `next-server`, останавливать его PID.
- Spec `design-system`: без слот-машины, конфетти и `random-search`.
- Токен `--decor-machine-indigo` → `--decor-indigo` (`globals.css`, `PhotoPlaceholder.tsx`).
- `StarVideo.tsx`: прогресс записи обновляет состояние шагом 1 %, а не каждый кадр.
- `HotelTile.tsx`: город через `getDestination(...)?.name` без `!`.
- `src/lib/vibe.ts`: границы шкалы расстояния из каталога (min/max `distanceKm`), а не константы 0,3–5 км; при равном числе совпадений архетип выбирается по приоритету его главной оси, а не по порядку таблицы.
- `VibeSearchDialog.tsx`: пара вариантов — `radiogroup` из двух `radio` (сохранённый ответ — `aria-checked`), «Не могу выбрать» — отдельная кнопка.
- `src/lib/collections.ts`: `homeCollections` вычисляется лениво при первом обращении, а не при импорте модуля.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `design-system`: требования без удалённой слот-машины.

## Impact

- `README.md`, `src/app/globals.css`, `src/components/ui/PhotoPlaceholder.tsx`, `src/components/StarSearch/StarVideo.tsx`, `src/components/HotelTile/HotelTile.tsx`, `src/lib/vibe.ts`, `src/components/VibeSearch/VibeSearchDialog.tsx`, `src/lib/collections.ts`, `src/components/HomeCollections/HomeCollections.tsx` при необходимости.
- Пересекается с `polish-tiles-and-star-search` (`StarVideo.tsx`, `HotelTile.tsx`): запускается после его слияния.

## Замер JS главной

Сумма чанков `/_next/static/**/*.js`, подключённых к `index.html` главной, `npm run build`:

| | файлов | байт | gzip |
| --- | --- | --- | --- |
| до | 16 | 920 436 | 303 113 |
| после | 16 | 920 454 | 303 124 |

Размер не меняется (+18 байт — обёртка геттера): подборки считаются при сборке статической главной, а клиентский чанк их не содержит. Выигрыш ленивости — в том, что модуль `collections` больше не обходит каталог при импорте.
