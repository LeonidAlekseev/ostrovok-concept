## 1. Сервер

- [x] 1.1 `look` в `route.ts` отличает сбой модели (`unstable`) от отсутствия модели и лимита (`unseen`)
- [x] 1.2 `PhotoAnswer.action` принимает `unstable`

## 2. Клиент

- [x] 2.1 `runTurn` при `unstable` показывает шаг о нестабильном подключении и повторяет запрос через 3, 6, 10 с
- [x] 2.2 После последнего повтора Эвал пишет `PHOTO_UNSTABLE`

## 3. Проверки

- [x] 3.1 Тесты маршрута и `AssistantPhotos`
- [x] 3.2 lint, typecheck, format:check, test, build
