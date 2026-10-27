## 1. Схемы

- [x] 1.1 `schema.ts` маршрутов: отели, вид, карты зданий и шума, Эвал, сброс кэша, документ; проверка типов `SameType`
- [x] 1.2 Маршруты разбирают запрос схемами, ответы — `satisfies`

## 2. Документ

- [x] 2.1 `src/lib/openapi/document.ts`, маршрут `GET /api/openapi.json`
- [x] 2.2 Реальные примеры: `scripts/openapi-examples.ts`
- [x] 2.3 Раздел Supabase: `scripts/openapi-supabase.ts`, `GET /api/openapi/supabase.json`

## 3. Страница

- [x] 3.1 `/api/docs`: Scalar, карта ответа, примеры на карте
- [x] 3.2 Пункт «API» в меню

## 4. Проверка

- [x] 4.1 Тесты: валидность OpenAPI 3.1, покрытие маршрутов, сверка Supabase, примеры по схемам, меню, `geoOfResponse`
- [x] 4.2 README, спеки
- [x] 4.3 lint, typecheck, test, format:check, openspec validate, build; `/api/docs` на 375 и 1280 px, «Try it» гео-маршрута с картой
