## Why
На главной при 768 px в консоли ошибка гидратации: у combobox поиска (`src/components/SearchForm/DestinationField.tsx`, `src/components/ui/combobox.tsx`) расходится `caret-color` между сервером и клиентом.

## What Changes
- Воспроизвести ошибку на `next dev` и `next start`, найти источник `caret-color` (стиль, зависящий от клиента при первом рендере).
- Исправить так, чтобы первый клиентский рендер совпадал с серверным; внешний вид и поведение поля не меняются.

## Impact
- `DestinationField.tsx` и/или `ui/combobox.tsx`. Specs не меняются.
