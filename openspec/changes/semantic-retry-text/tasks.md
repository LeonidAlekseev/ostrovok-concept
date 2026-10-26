## 1. Повтор

- [ ] 1.1 `searchStep`: один повтор при `failed` (`timeout`, `model`, `database`), если осталось ≥ `MIN_SEMANTIC_MS`; бюджет первой попытки оставляет время на повтор
- [ ] 1.2 Без повтора при `no-key`, `aborted`, `empty`

## 2. Предупреждение

- [ ] 2.1 `TurnState` получает признак сбоя поиска; `wishTurn` ставит `modelsDown: true`, клиент показывает `MODELS_DOWN` один раз
- [ ] 2.2 Строка шага при сбое — «модель не ответила — подобрал по правилам»

## 3. Тесты и проверка

- [ ] 3.1 Тесты: повтор успел; повтор не успел → правила + `modelsDown`; `no-key`/`empty` — без предупреждения; ответ в пределах 15 с
- [ ] 3.2 lint, typecheck, весь `npm test`, format:check, `openspec validate --all --strict`
