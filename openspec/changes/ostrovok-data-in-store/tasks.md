## 1. Номера
- [x] 1.1 `OtaPageFields.rooms`, `pageRooms`, фото, удобства и площадь номера из `roomGroups`; тесты
- [x] 1.2 `Room.amenities` в каталоге и API-схеме; строка удобств в `RoomList` и `RoomRates`

## 2. Хранилище
- [x] 2.1 `factsStore` и `roomViewStore`; `db:features` их пишет (`hotel`, `room` — свои свойства скрипта)
- [x] 2.2 Миграция `entities.metadata`; точки мест при загрузке; `loadHotelRelations` читает их из `metadata`
- [x] 2.3 `method.straight_m` у утверждения Островка о расстоянии

## 3. Данные Островка
- [x] 3.1 `poiName`: аэропорт под своим названием в `ota_pois`
- [ ] 3.2 Дубль `ota-9783413` / `ota-9559092` — решение пользователя

## 4. Проверки
- [ ] 4.1 Полный набор проверок, проверка вживую
