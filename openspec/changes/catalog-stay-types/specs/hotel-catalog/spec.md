## ADDED Requirements

### Requirement: Типы жилья
Объект каталога SHALL иметь тип жилья (`hotel`, `hostel`, `apartments`, `villa`), скорость Wi‑Fi в Мбит/с и признак рабочей зоны. В каждом городе SHALL быть не меньше 2 хостелов, 2 апартаментов и 1 виллы. Прежние отели SHALL сохранить `id` и данные.

#### Scenario: Хостелы города
- **WHEN** запрашиваются объекты `prague` типа `hostel`
- **THEN** их не меньше двух

#### Scenario: Прежний отель
- **WHEN** открывается `prague-old-town-lantern`
- **THEN** это `hotel` с прежними ценами
