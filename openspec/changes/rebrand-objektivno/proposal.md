## Why
Пользователь меняет бренд проекта: «О!Погнали» → «О!бъективно», слоган героя «Путешествуй легко» → «Отель без догадок». В подвале нужен текст «Демо-проект: концепт платформы агрегатора поиска отелей.» Облако и кнопка «Рандом» на главной больше не нужны.

## What Changes
- Название «О!Погнали» → «О!бъективно» везде, где его видит пользователь или поисковик: логотип и aria-label шапки, `metadata` (title, description, OpenGraph), подвал, юридические тексты, FAQ/помощь, картинки и видео для «поделиться» (vibe, star), системные промпты ИИ, README, `global-error`.
- Заголовок героя `h1`: «Отель без догадок» (вторая строка синим, как сейчас «легко» — «без догадок»).
- Подвал: пометка «Демо-проект: концепт платформы агрегатора поиска отелей.» вместо прежней пометки про демо.
- Убрать кнопку «Рандом», облако под ней и раскрутку глобуса к случайному городу (`CLOUD_IMAGES`, `cloudImages.ts`, `public/images/hero/clouds/`, `scripts/build-clouds.py`, если больше не нужны).
- Не трогать файлы маршрутов и планов поездки (`src/lib/routes.ts`, `src/lib/trip.ts`, `src/components/RoutePage`, `RouteCard`, `TripPlan`, `src/app/routes`, `src/app/trip`): их удаляет параллельный change `hotels-only`.

## Impact
- `Header`, `Footer`, `layout.tsx`, `Hero.tsx`, `global-error.tsx`, `src/data/legal.ts`, `src/lib/shareMedia.ts`, `src/lib/ai/*`, README, тесты.
- Спеки `site-header`, `app-shell`, `home-page`, `hero-globe`, `design-system` и описания (Purpose) спек с названием.
