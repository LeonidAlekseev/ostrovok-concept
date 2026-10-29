## ADDED Requirements

### Requirement: Адрес страницы Островка при загрузке
`npm run db:load:ota-pages` SHALL сохранять адрес страницы отеля в `ota_hotel_pages.url`, если снимок называет его сам (маршрут `page` и `query` элемента `__NEXT_DATA__`, имя которого содержит `master_id` отеля), и `null` иначе. Адрес SHALL не собираться по шаблону. `npm run db:features` SHALL записывать его в `url` источников страницы (факты и отзывы).

#### Scenario: Снимок называет адрес
- **WHEN** в снимке `page` — `/hotel/[country]/[city]/[mid]/[slug]`, а `query` задаёт все четыре части, и в адресе есть `master_id`
- **THEN** `ota_hotel_pages.url` — адрес на `ostrovok.ru`

#### Scenario: Адреса нет
- **WHEN** в снимке нет маршрута или не хватает части
- **THEN** `url` — `null`, источник страницы без ссылки
