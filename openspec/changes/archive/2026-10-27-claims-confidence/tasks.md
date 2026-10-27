## 1. Политика уверенности

- [x] 1.1 `src/lib/confidence.ts`: уверенность источников, штрафы допущений, правило `confidenceOf`, правила видов утверждений, версия `confidence-1`
- [x] 1.2 `src/lib/claimRows.ts`: уверенность и `method.confidence` у каждого утверждения, уверенность связи — её утверждения

## 2. Новые связи

- [x] 2.1 `placesStore`: места повседневных нужд в 1 км из `osm_places_near`, места Островка в приоритете (`mergePlaces`)
- [x] 2.2 `buildingStore`: ближайшее здание EUBUCCO, `nearest_building`, высота и этажность
- [x] 2.3 `scripts/lib/claims-store.ts`: своя часть — свойства `noise.*`, `nearby.*`, `building.*`, сущности `building`/`ota_poi`, доказательства EUBUCCO и `ota_page`, связи `nearest_building`

## 3. Заполнение

- [x] 3.1 `scripts/hotel-features.ts`: места Островка, второй вызов `osm_places_near`, здание; карты шума по одной, отели по 4
- [x] 3.2 Прогон `npm run db:features` до `hotel_noise_maps_prune` и повторный прогон без записей

## 4. Проверка

- [x] 4.1 Тесты политики и построителей; README и spec `hotel-knowledge`
