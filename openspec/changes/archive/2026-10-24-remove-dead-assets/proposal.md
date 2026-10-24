## Why
После редизайнов в коде остались данные и токены, которые никто не читает: картинки сценариев (`image`, `alt` у `scenarios` в `src/data/destinations.ts`) и цвет `--brand-green-gray` в `src/app/globals.css` (не используется с #105). Они вводят в заблуждение и тянут в сборку три лишних WebP.

## What Changes
- Убрать поля `image` и `alt` из типа `Scenario` и массива `scenarios` (`src/data/destinations.ts`). `id` и `title` остаются: их читают `findScenario`, `search.ts`, `ai/documents.ts`.
- Удалить `public/images/sea-navagio.webp`, `florence-duomo.webp`, `paris-eiffel.webp`, их строки в `public/images/CREDITS.md` и записи в `scripts/build-images.py`.
- Удалить `--brand-green-gray` из `src/app/globals.css`.
- Видимое поведение не меняется.

## Impact
- `src/data/destinations.ts`, `src/app/globals.css`, `public/images/`, `scripts/build-images.py`.
- Specs не меняются: поля и токен в требованиях не упоминаются.
