# Design

- **Цена ночи.** `nightPrice(pricePerNight, date)`: если `date` — пятница или суббота (ночь начинается в этот день), `roundUp100(price × 1.15)`, иначе `price`. `pricePerNight` в каталоге остаётся будничной ценой.
- **Сумма.** `stayTotal(pricePerNight, checkIn, checkOut, rooms)` суммирует ночи `checkIn…checkOut−1` и умножает на `rooms`. Заменяет `offerTotal` во всех местах; старую функцию удалить.
- **Средняя за ночь.** `Math.round(total / rooms / nights)` — для «за ночь» в тарифах, фильтре цены и удержания при отмене.
- **Поиск.** `applyFilters` получает срок: лучший тариф и сортировка по сумме, фильтр по средней цене ночи. Без срока — по `pricePerNight`, как сейчас.
- **Даты в UTC.** День недели берётся из `IsoDate` без часового пояса браузера (как в `nightsBetween`).
