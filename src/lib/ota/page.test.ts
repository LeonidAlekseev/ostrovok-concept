import { describe, expect, it } from 'vitest'
import { factLines } from '../hotelDetails'
import {
  nextDataPageProps,
  otaHotelDetails,
  pageFields,
  pageFieldsRowSchema,
  pageRowSchema,
  placeRowSchema,
  plainNotes,
  roomFloorsOf,
  trimPage,
  viewQuotes,
  type PlaceRow,
} from './page'

/** A page of the snapshots' shape, with made-up values. */
function pageProps() {
  return {
    hotel: {
      masterId: '13666997',
      name: 'Отель у выставки',
      contacts: { email: 'desk@example.com', phone: '+34000000000' },
      images: [{ tmpl: 'https://cdn.ostrovok.ru/t/{size}/a.jpg', relativePath: '/t/{size}/a.jpg' }],
      roomGroups: [
        {
          nameStruct: { mainName: 'Номер Standard' },
          roomAmenityData: ['air-conditioning', 'workstation'],
          images: [{ tmpl: 'https://cdn.ostrovok.ru/t/{size}/b.jpg', relativePath: '/t/{size}/b.jpg' }],
        },
      ],
      location: {
        address: 'Avenida 2, Валенсия',
        pois: [
          {
            regionId: 2,
            distance: 3165,
            name: 'Зоопарк',
            nameEn: 'Zoo',
            isNearby: false,
            isTopPoi: true,
            isTransportHub: false,
          },
          {
            regionId: 1,
            distance: 135,
            name: 'Станция',
            nameEn: 'Station',
            isNearby: true,
            isTopPoi: false,
            isTransportHub: true,
          },
          {
            regionId: 9,
            distance: 10,
            name: 'Без точки',
            nameEn: '',
            isNearby: true,
            isTopPoi: false,
            isTransportHub: false,
          },
        ],
      },
      descriptionStruct: [
        { title: 'Расположение', paragraphs: ['Отель  находится в <em>Валенсии</em>.', ''] },
        { title: 'Пусто', paragraphs: [] },
        { title: 'В отеле', paragraphs: ['Есть лифт.'] },
      ],
      amenityGroups: [
        { name: 'Общее', slug: 'has_common_info', amenities: [{ amenityId: 26, name: 'Лифт', isFree: 1 }] },
        { name: 'Пустая', slug: 'has_x', amenities: [] },
      ],
      facts: {
        electricity: { frequency: [50], sockets: ['C', 'F'], voltage: [230] },
        floorsNumber: 6,
        roomsNumber: 140,
        yearBuilt: 0,
        yearRenovated: 0,
      },
      policies: {
        checkInCheckOut: {
          value: {
            checkInTimeStart: { hours: 15, minutes: 0 },
            checkOutTimeEnd: { hours: 11, minutes: 0 },
          },
        },
        parking: {
          value: [
            {
              inclusion: 'NOT_INCLUDED',
              currency: 'EUR',
              price: 22,
              priceUnit: 'PER_CAR_PER_NIGHT',
              territoryType: 'OFF_SIDE',
            },
          ],
        },
        pets: { value: [{ inclusion: 'NOT_INCLUDED', currency: 'EUR', price: 15, priceUnit: 'PER_PET_PER_STAY' }] },
        internet: {
          value: [
            { inclusion: 'NOT_INCLUDED', currency: 'EUR', price: 3.9000000953674316, priceUnit: 'PER_GUEST_PER_NIGHT' },
          ],
        },
        children: { value: [{ ageStart: 0, ageEnd: 0, extraBed: 'UNAVAILABLE' }] },
        deposit: { value: [] },
        extraInfo: { value: 'Стойка регистрации работает до 23:00.' },
      },
      rating: {
        ostrovok: {
          detailedRatings: { cleanness: 8, hygiene: 0, location: 9.666666984558105, wifi: 10 },
          numReviews: 9,
          rating: 7.699999809265137,
        },
        tripAdvisor: { detailedRatings: null, numReviews: 1327, rating: 4.5 },
        featuredReviews: [
          {
            text: 'Номер с видом на море. Всё понравилось.',
            reviewPlus: '',
            reviewMinus: '',
            author: 'Анна',
            rating: 10,
            source: 'TA',
          },
          {
            text: '',
            reviewPlus: 'Красивый вид из окна на площадь.',
            reviewMinus: '',
            author: 'Олег',
            rating: 9,
            source: 'OST',
          },
          { text: '', reviewPlus: '', reviewMinus: '', author: 'Пусто', rating: 8, source: 'ESR' },
          {
            text: 'Внешний вид отеля старый.',
            reviewPlus: '',
            reviewMinus: '',
            author: 'Ира',
            rating: 6,
            source: 'ESR',
          },
        ],
      },
    },
    pois: [
      {
        regionId: 1,
        type: 'SUBWAY',
        subtype: 'UNSPECIFIED',
        name: 'Станция',
        nameEn: 'Station',
        center: { lat: 39.5, lng: -0.42 },
      },
      {
        regionId: 2,
        type: 'POI',
        subtype: 'ZOOS_AND_AQUARIUMS',
        name: 'Зоопарк',
        nameEn: 'Zoo',
        center: { lat: 39.47, lng: -0.4 },
      },
      {
        regionId: 2,
        type: 'POI',
        subtype: 'ZOOS_AND_AQUARIUMS',
        name: 'Зоопарк',
        nameEn: 'Zoo',
        center: { lat: 39.47, lng: -0.4 },
      },
    ],
    reviews: {
      list: [
        {
          id: 6488922,
          reviewType: 'TRP',
          reviewDate: '2018-12-05 00:00:00+00',
          reviewTitle: 'Номер с видом',
          reviewText: 'Номер с видом на море. Всё понравилось.',
          reviewPlus: '',
          reviewMinus: '',
          orderContext: { authorName: 'Анна' },
          rating: 10,
          reviewLikes: 2,
        },
        {
          id: 1,
          reviewType: 'OST',
          reviewDate: '2022-08-06 00:00:00+00',
          reviewTitle: '',
          reviewText: '',
          reviewPlus: 'Тихо.',
          reviewMinus: 'Мало розеток.',
          orderContext: { authorName: '' },
          rating: 8,
          reviewLikes: 0,
        },
      ],
      total: 10,
    },
    rateSpecTagTranslations: [
      { name: 'child-bed', priority: 0, translation: 'Детская кровать включена', adjKind: 'NEUTRAL' },
    ],
    // The rest of the page is not kept.
    serpFilters: ['x'],
    _sentryTraceData: 'trace',
  }
}

const snapshot = (content: unknown) => [
  { id: 'other', content: {} },
  { id: '__NEXT_DATA__', content },
]

/** The stored page as the site reads it back (`PAGE_COLUMNS`). */
function storedRow() {
  const page = trimPage(pageProps())
  const hotel = page.hotel as Record<string, unknown>
  return pageRowSchema.parse({
    master_id: page.masterId,
    description: hotel.descriptionStruct,
    amenityGroups: hotel.amenityGroups,
    policies: hotel.policies,
    facts: hotel.facts,
    rating: hotel.rating,
    reviews: page.reviews,
  })
}

const places: PlaceRow[] = [
  {
    region_id: 2,
    type: 'POI',
    subtype: 'ZOOS_AND_AQUARIUMS',
    name: 'Зоопарк',
    distance_m: 3165,
    is_transport_hub: false,
  },
  { region_id: 1, type: 'SUBWAY', subtype: 'UNSPECIFIED', name: 'Станция', distance_m: 135, is_transport_hub: true },
].map((place) =>
  placeRowSchema.parse({ ...place, hotel_id: 'ota-13666997', name_en: '', lat: 39.5, lon: -0.4, bearing_deg: 90 }),
)

describe('nextDataPageProps', () => {
  it('reads props.pageProps of the __NEXT_DATA__ element, its content an object or its JSON', () => {
    expect(nextDataPageProps(snapshot({ props: { pageProps: { a: 1 } } }))).toEqual({ a: 1 })
    expect(nextDataPageProps(snapshot(JSON.stringify({ props: { pageProps: { a: 2 } } })))).toEqual({ a: 2 })
  })

  it('refuses a snapshot without the element or the props', () => {
    expect(() => nextDataPageProps({})).toThrow(/not a list/)
    expect(() => nextDataPageProps([{ id: 'x' }])).toThrow(/__NEXT_DATA__/)
    expect(() => nextDataPageProps(snapshot({ props: {} }))).toThrow(/pageProps/)
  })
})

describe('trimPage', () => {
  it('keeps the hotel without its contacts, its places and the images’ relativePath', () => {
    const page = trimPage(pageProps())
    expect(page.masterId).toBe(13666997)
    expect(page.hotel).not.toHaveProperty('contacts')
    expect(JSON.stringify(page)).not.toMatch(/desk@example\.com|\+34000000000/)
    expect(page.hotel.location).toEqual({ address: 'Avenida 2, Валенсия' })
    expect(JSON.stringify(page.hotel)).not.toMatch(/relativePath/)
    expect(page.hotel).not.toHaveProperty('serpFilters')
    expect(page).not.toHaveProperty('serpFilters')
  })

  it('keeps the places once each and the hotel’s links only to the places with a point', () => {
    const page = trimPage(pageProps())
    expect(page.pois.map((poi) => poi.regionId)).toEqual([1, 2])
    expect(page.hotelPois.map((p) => [p.regionId, p.distance])).toEqual([
      [2, 3165],
      [1, 135],
    ])
    expect(page.rateTags).toEqual([
      { name: 'child-bed', priority: 0, translation: 'Детская кровать включена', adjKind: 'NEUTRAL' },
    ])
  })

  it('refuses a page without the hotel’s master id', () => {
    const props = pageProps() as { hotel: Record<string, unknown> }
    delete props.hotel.masterId
    expect(() => trimPage(props)).toThrow()
  })
})

describe('otaHotelDetails', () => {
  const details = otaHotelDetails(storedRow(), places, {
    floors: 19,
    height_m: 60,
    floors_source: 'estimated',
    height_source: 'estimated',
  })

  it('gives the description by its parts, the empty ones dropped', () => {
    expect(details.description).toEqual([
      { title: 'Расположение', paragraphs: ['Отель находится в Валенсии.'] },
      { title: 'В отеле', paragraphs: ['Есть лифт.'] },
    ])
    expect(details.amenityGroups).toEqual([{ name: 'Общее', slug: 'has_common_info', amenities: ['Лифт'] }])
  })

  it('tells the floors the rooms take from the floors of the building, which are EUBUCCO’s', () => {
    expect(details.facts).toMatchObject({ rooms: 140, roomFloors: 6, yearBuilt: null, yearRenovated: null })
    expect(details.building).toEqual({ floors: 19, heightM: 60, estimated: true })
    expect(factLines(details.facts, details.building)).toEqual([
      '140 номеров',
      'Номера занимают 6 этажей (по данным отеля)',
      'В здании 19 этажей (EUBUCCO, оценка)',
      'Розетки C, F · 230 В · 50 Гц',
    ])
    expect(otaHotelDetails(storedRow(), []).building).toBeNull()
  })

  it('shows no building lower than the floors the rooms take: the point matched another building', () => {
    const lower = { floors: 3, height_m: 10, floors_source: 'gov-spain', height_source: 'gov-spain' }
    const doubtful = otaHotelDetails(storedRow(), places, lower)
    expect(doubtful.building).toBeNull()
    expect(factLines(doubtful.facts, doubtful.building)).toContain('Номера занимают 6 этажей (по данным отеля)')
    expect(factLines(doubtful.facts, doubtful.building).join()).not.toMatch(/В здании/)
  })

  it('lists the priced services and the fees, and the notes as they are', () => {
    expect(details.policies).toEqual([
      { label: 'Парковка рядом с отелем', value: '22 € за машину в сутки' },
      { label: 'Размещение с питомцами', value: '15 € за питомца за проживание' },
      { label: 'Интернет', value: '3,9 € за гостя в сутки' },
      { label: 'Дополнительная кровать для детей', value: 'не предоставляется' },
    ])
    expect(details.notes).toBe('Стойка регистрации работает до 23:00.')
  })

  it('gives the scores by source on their own scales, the empty sections dropped', () => {
    expect(details.scores).toEqual([
      {
        source: 'ostrovok',
        rating: 7.7,
        scale: 10,
        reviewCount: 9,
        sections: [
          { label: 'Чистота', score: 8 },
          { label: 'Расположение', score: 9.7 },
          { label: 'Качество Wi‑Fi', score: 10 },
        ],
      },
      { source: 'tripadvisor', rating: 4.5, scale: 5, reviewCount: 1327, sections: [] },
    ])
  })

  it('gives every review with its source once, the newest first and the undated after them', () => {
    expect(details.reviews.map((r) => [r.id, r.source, r.date, r.author])).toEqual([
      ['ota-review-1', 'ostrovok', '2022-08-06', 'Гость'],
      ['ota-review-6488922', 'tripadvisor', '2018-12-05', 'Анна'],
      ['ota-featured-13666997-2', 'ostrovok', null, 'Олег'],
      ['ota-featured-13666997-4', 'ostrovok', null, 'Ира'],
    ])
    expect(details.reviews[0]).toMatchObject({ pros: 'Тихо.', cons: 'Мало розеток.', score: 8 })
    expect(details.reviews[1]).toMatchObject({
      title: 'Номер с видом',
      text: 'Номер с видом на море. Всё понравилось.',
    })
  })

  it('gives the places nearest first with their kinds', () => {
    expect(details.nearby.map((p) => [p.name, p.kind, p.distanceM, p.transport])).toEqual([
      ['Станция', 'Станция', 135, true],
      ['Зоопарк', 'Зоопарк или аквариум', 3165, false],
    ])
  })

  it('quotes the sentences about the view word for word, once each, not «внешний вид»', () => {
    expect(details.viewQuotes.map((q) => [q.text, q.source, q.author])).toEqual([
      ['Номер с видом', 'tripadvisor', 'Анна'],
      ['Номер с видом на море.', 'tripadvisor', 'Анна'],
      ['Красивый вид из окна на площадь.', 'ostrovok', 'Олег'],
    ])
  })
})

describe('viewQuotes', () => {
  const review = (text: string) => ({ id: 'r', author: 'А', date: null, score: 9, text, helpful: 0 })

  it.each([
    ['Из окон открывался вид на улицу.', true],
    ['Вид из номера - замечательный!', true],
    ['Выход на крышу с чудесным видом...', true],
    ['Панорама города с балкона.', true],
    ['Оформили вид на жительство.', false],
    ['Внешний вид фасада старый.', false],
    ['Завтрак в виде шведского стола.', false],
    ['Разные виды сыра.', false],
  ])('«%s» is about the view: %s', (text, about) => {
    expect(viewQuotes([review(text)]).length > 0).toBe(about)
  })

  it('cuts a long sentence at a word', () => {
    const [quote] = viewQuotes([review(`Вид на море ${'и ещё слово '.repeat(40)}конец.`)])
    expect(quote.text.length).toBeLessThanOrEqual(281)
    expect(quote.text).toMatch(/^Вид на море .*…$/)
  })
})

describe('plainNotes', () => {
  it('turns the notes’ HTML into lines of text', () => {
    expect(
      plainNotes(
        'Стойка работает 24/7.\n<p><b>Полезная информация</b> <br /><ul><li>Доплата: 8.50 EUR &amp; более</li><li>Животные</li></ul></p>',
      ),
    ).toBe('Стойка работает 24/7.\nПолезная информация\n• Доплата: 8.50 EUR & более\n• Животные')
  })
})

describe('roomFloorsOf', () => {
  it('maps the hotels to the floors their rooms take, the unknown ones left out', () => {
    expect(
      roomFloorsOf([
        { master_id: 1, floors: 6 },
        { master_id: '2', floors: 0 },
        { master_id: 3, floors: null },
      ]),
    ).toEqual(new Map([['ota-1', 6]]))
  })
})

describe('pageFields', () => {
  it('gives the catalogue row the description, the times and the workspace', () => {
    const page = trimPage(pageProps())
    const hotel = page.hotel as Record<string, unknown>
    const row = pageFieldsRowSchema.parse({
      master_id: page.masterId,
      description: hotel.descriptionStruct,
      policies: hotel.policies,
      roomGroups: hotel.roomGroups,
    })
    expect(pageFields(row)).toEqual({
      description: 'Отель находится в Валенсии.\n\nЕсть лифт.',
      checkIn: '15:00',
      checkOut: '11:00',
      workspace: true,
    })
    expect(pageFields({ ...row, roomGroups: [{ roomAmenityData: ['safe'] }] }).workspace).toBe(false)
  })
})
