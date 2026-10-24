## 1. Проверка
- [x] 1.1 Подтвердить поиском по репозиторию, что `scenario.image`, `scenario.alt`, три WebP и `--brand-green-gray` нигде не читаются (код, тесты, README, specs)

## 2. Удаление
- [x] 2.1 Убрать `image` и `alt` из `Scenario` и `scenarios` в `src/data/destinations.ts`
- [x] 2.2 Удалить три WebP, их строки в `public/images/CREDITS.md` и записи в `scripts/build-images.py`
- [x] 2.3 Удалить `--brand-green-gray` из `src/app/globals.css`

## 3. Проверка
- [x] 3.1 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
