/** What a phrase must give: the fields of the brief the traveller named (the rest stays unchecked). */
export interface PhraseCase {
  text: string
  destinationId?: string
  checkIn?: string
  checkOut?: string
  party?: 'solo' | 'couple' | 'family' | 'friends'
  budget?: number
  nights?: number
}

/** Phrases the assistant must read on the first try; «today» is 2026-10-26. */
export const PHRASES: PhraseCase[] = [
  {
    text: 'Тихий отель в Валенсии с 10 по 15 ноября вдвоём',
    destinationId: 'valencia',
    checkIn: '2026-11-10',
    checkOut: '2026-11-15',
    party: 'couple',
  },
  {
    text: 'Хочу в Валенсию с 10 по 15 ноября',
    destinationId: 'valencia',
    checkIn: '2026-11-10',
    checkOut: '2026-11-15',
  },
  {
    text: 'Отель в Праге 12–16 ноября, нас двое',
    destinationId: 'prague',
    checkIn: '2026-11-12',
    checkOut: '2026-11-16',
    party: 'couple',
  },
  {
    text: 'Поедем в Барселону с 1 по 8 декабря с ребёнком',
    destinationId: 'barcelona',
    checkIn: '2026-12-01',
    checkOut: '2026-12-08',
    party: 'family',
  },
  {
    text: 'Ищу жильё в Стамбуле 20.11–25.11',
    destinationId: 'istanbul',
    checkIn: '2026-11-20',
    checkOut: '2026-11-25',
  },
  {
    text: 'Мы с женой хотим в Лиссабон на выходные 14–16 ноября',
    destinationId: 'lisbon',
    checkIn: '2026-11-14',
    checkOut: '2026-11-16',
    party: 'couple',
  },
  {
    text: 'Поживу в Тбилиси с 3 по 10 декабря один',
    destinationId: 'tbilisi',
    checkIn: '2026-12-03',
    checkOut: '2026-12-10',
    party: 'solo',
  },
  {
    text: 'Отель в Сочи на неделю с 5 ноября',
    destinationId: 'sochi',
    checkIn: '2026-11-05',
    checkOut: '2026-11-12',
    nights: 7,
  },
  {
    text: 'В Риме с 28 ноября по 2 декабря вчетвером с друзьями',
    destinationId: 'rome',
    checkIn: '2026-11-28',
    checkOut: '2026-12-02',
    party: 'friends',
  },
  {
    text: 'Нужен номер в Париже, заезд 15 ноября, выезд 18 ноября, вдвоём',
    destinationId: 'paris',
    checkIn: '2026-11-15',
    checkOut: '2026-11-18',
    party: 'couple',
  },
  {
    text: 'Поехать в Дубай с 20 по 27 декабря бюджет 150000',
    destinationId: 'dubai',
    checkIn: '2026-12-20',
    checkOut: '2026-12-27',
    budget: 150000,
  },
  {
    text: 'Лондон с 7 по 10 ноября, семьёй с двумя детьми',
    destinationId: 'london',
    checkIn: '2026-11-07',
    checkOut: '2026-11-10',
    party: 'family',
  },
  {
    text: 'Что есть в Мадриде на 3 ночи с 12 ноября?',
    destinationId: 'madrid',
    checkIn: '2026-11-12',
    checkOut: '2026-11-15',
    nights: 3,
  },
  {
    text: 'Хочу отдохнуть в Анталье с 1 по 10 ноября за 100 тысяч',
    destinationId: 'antalya',
    checkIn: '2026-11-01',
    checkOut: '2026-11-10',
    budget: 100000,
  },
  {
    text: 'Едем в Калининград с 9 по 12 ноября вдвоём с мужем',
    destinationId: 'kaliningrad',
    checkIn: '2026-11-09',
    checkOut: '2026-11-12',
    party: 'couple',
  },
  {
    text: 'Нью-Йорк с 5 по 12 декабря, бюджет 300 000 рублей',
    destinationId: 'new-york',
    checkIn: '2026-12-05',
    checkOut: '2026-12-12',
    budget: 300000,
  },
  {
    text: 'Забронировать в Стокгольме с 17 по 20 ноября, я один',
    destinationId: 'stockholm',
    checkIn: '2026-11-17',
    checkOut: '2026-11-20',
    party: 'solo',
  },
  {
    text: 'Валенсия, 10-15 ноября, двое взрослых',
    destinationId: 'valencia',
    checkIn: '2026-11-10',
    checkOut: '2026-11-15',
    party: 'couple',
  },
  {
    text: 'Подберите отель во Флоренции на 4 ночи с 22 ноября',
    destinationId: 'florence',
    checkIn: '2026-11-22',
    checkOut: '2026-11-26',
    nights: 4,
  },
  {
    text: 'Хотим с друзьями в Токио с 1 по 9 декабря',
    destinationId: 'tokyo',
    checkIn: '2026-12-01',
    checkOut: '2026-12-09',
    party: 'friends',
  },
  {
    text: 'Выходные в Таллине... то есть в Хельсинки, 13–15 ноября',
    destinationId: 'helsinki',
    checkIn: '2026-11-13',
    checkOut: '2026-11-15',
  },
  {
    text: 'С 10 по 15 ноября в Валенсии, мы вдвоём с мужем, тихо',
    destinationId: 'valencia',
    checkIn: '2026-11-10',
    checkOut: '2026-11-15',
    party: 'couple',
  },
  {
    text: 'Едем всей семьёй в Сочи с 25 декабря по 3 января',
    destinationId: 'sochi',
    checkIn: '2026-12-25',
    checkOut: '2027-01-03',
    party: 'family',
  },
  {
    text: 'Для меня одного номер в Амстердаме... нет, в Осло, 2–5 декабря',
    destinationId: 'oslo',
    checkIn: '2026-12-02',
    checkOut: '2026-12-05',
    party: 'solo',
  },
]
