# ostrovok-concept

Островок! - концепт агрегатора в сфере онлайн-бронирования жилья

Главная страница сервиса бронирования отелей (Next.js 16 App Router + React 19 + TypeScript).
Визуальный референс — `references/homepage.jpg`.

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production-сборка (страница пререндерится статически)
npm run start      # запуск собранной версии
npm run lint
npm run typecheck
```

## Деплой на Vercel

Vercel определяет проект как Next.js без дополнительной настройки:
импортируйте репозиторий (Framework Preset — Next.js, команды по умолчанию)
или выполните `npx vercel --prod` из корня. Нужен Node.js ≥ 20.9.
Переменные окружения не требуются.

Вне production (`npm run dev` и preview-деплои Vercel, по `VERCEL_ENV`) в левом нижнем углу
показываются технические параметры глобуса: fps, время кадра, разрешение рендера, уровень качества,
объём геометрии. Проверить production-сборку с ними локально: `VERCEL_ENV=preview npm run build`.

## Производительность глобуса

Глобус — точечный wireframe на Canvas 2D, без WebGL и текстур: ~6 300 точек суши, контуры
побережий и сетка широт и долгот (`public/data/globe.json`, 45 KB в gzip). Кадр — поворот
единичных векторов без тригонометрии на точку и три заливки точек плюс два штриха линий.
Разрешение рендера адаптивное (`src/components/Hero/globePerformance.ts`): старт с 2× на любом
устройстве, при устойчивых < 45 fps снижается ступенями до 0.75×. Стоящий глобус не перерисовывается, на экранах 120 Гц
кадры идут с частотой 60 fps.

## Демо-режим

Бэкенда нет: поиск валидирует форму, формирует параметры запроса
(`?destination=…&checkin=…&checkout=…&adults=…&rooms=…`, они же пишутся в адресную строку)
и показывает ориентировочные цены из локального каталога `src/data/destinations.ts`.
Бронирование, вход в профиль и избранное не реализованы.

## Изображения

Готовые файлы лежат в `public/images` (источники и лицензии — `public/images/CREDITS.md`):

```bash
uv run --with pillow python scripts/build-images.py <папка-с-исходниками>
```

Геометрия глобуса собирается из Natural Earth 1:50m (`ne_50m_land.geojson`,
`ne_50m_coastline.geojson`):

```bash
uv run --with pillow --with numpy python scripts/build-globe.py <папка-с-geojson>
```
