# Design

- **Знаки.** Каждый знак в своей группе `<g>` с обратным вращением той же длительности (`animate-[spin_120s_linear_infinite_reverse]` вокруг своего центра, `transform-box: fill-box; transform-origin: center`), только `motion-safe:`.
- **Карусель.** Проп `swipe={false}`: лента `overflow-x-hidden` (прокрутка только из кода стрелками), `touch-action: pan-x` уходит к родительской ленте. На тач-экранах без наведения стрелки в этом режиме видны всегда.
- **Ассистент.** `total = stayTotal(perNight, checkIn, checkOut, rooms)` для выбора отеля в бюджете и для суммы варианта; `perNight` остаётся будничной ценой. Даты плана уже есть в `brief`.
