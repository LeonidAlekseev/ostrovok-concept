## Why
Решение пользователя 2026-10-24: пустые состояния «Мои поездки» (`src/components/Trips/TripsPage.tsx:49`) и «Избранное» (`src/components/Favorites/FavoritesPage.tsx:32`) ведут ссылкой «Найти отель» на главную. Как на 404 и в бронировании (`search-links-fallback`), нужны две ссылки: «Спросить Эвал» и «Искать вручную».

## What Changes
- Пустые «Мои поездки» и «Избранное»: «Спросить Эвал» → `/assistant` и «Искать вручную» → `/search` вместо «Найти отель».
- Оформление — как в `BookingPage` после `search-links-fallback`.

## Impact
- `TripsPage.tsx`, `FavoritesPage.tsx`, их тесты. Specs `trips`, `favorites`.
