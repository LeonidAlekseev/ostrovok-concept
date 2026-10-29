import { describe, expect, it } from 'vitest'
import { factLines } from '../hotelDetails'
import {
  nextDataPageProps,
  nextDataPageUrl,
  otaHotelDetails,
  pageFields,
  pageRooms,
  poiName,
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

describe('nextDataPageUrl', () => {
  const route = (page: unknown, query: unknown) => snapshot({ page, query, props: { pageProps: {} } })
  const page = '/hotel/[country]/[city]/[mid]/[slug]'
  const query = { country: 'spain', city: 'valencia', mid: 'mid7481548', slug: 'tryp_valencia_oceanic_hotel_3' }

  it('fills the route of the snapshot with its query, and names the hotel', () => {
    expect(nextDataPageUrl(route(page, query), 7481548)).toBe(
      'https://ostrovok.ru/hotel/spain/valencia/mid7481548/tryp_valencia_oceanic_hotel_3/',
    )
    expect(nextDataPageUrl(snapshot(JSON.stringify({ page, query })), 7481548)).toContain('mid7481548')
  })

  it('gives nothing it would have to guess: no route, a parameter missing, another hotel', () => {
    expect(nextDataPageUrl(snapshot({ props: {} }), 7481548)).toBeNull()
    expect(nextDataPageUrl(route('/search', query), 7481548)).toBeNull()
    expect(nextDataPageUrl(route(page, { ...query, slug: undefined }), 7481548)).toBeNull()
    expect(nextDataPageUrl(route(page, query), 13115571)).toBeNull()
    expect(nextDataPageUrl({}, 7481548)).toBeNull()
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
    expect(details.building).toEqual({ floors: 19, heightM: 60, estimated: true, heightEstimated: true })
    // The cadastre's floors with a model's height: the height alone is an estimate.
    const cadastre = { floors: 8, height_m: 30.6, floors_source: 'gov-spain', height_source: 'estimated' }
    expect(otaHotelDetails(storedRow(), places, cadastre).building).toEqual({
      floors: 8,
      heightM: 30.6,
      estimated: false,
      heightEstimated: true,
    })
    expect(factLines(details.facts, details.building)).toEqual([
      '140 номеров',
      'Номера занимают 6 этажей (по данным отеля)',
      'В здании ≈19 этажей',
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

  it('names a place Ostrovok has twice once, by its nearer name', () => {
    const lonja = [
      { region_id: 6160500, name: 'Ла-Лонья', name_en: 'La Lonja', distance_m: 400, lat: 39.4741249, lon: -0.378566 },
      {
        region_id: 966082472,
        name: 'Лонха-де-ла-Седа',
        name_en: 'La Lonja de la Seda de Valencia',
        distance_m: 420,
        lat: 39.4745026,
        lon: -0.378185,
      },
    ].map((place) =>
      placeRowSchema.parse({
        ...place,
        hotel_id: 'ota-13666997',
        type: 'POI',
        subtype: 'HISTORICAL_POI',
        is_transport_hub: false,
        bearing_deg: 90,
      }),
    )
    expect(
      otaHotelDetails(storedRow(), [...places, ...lonja]).nearby.map((p) => [p.name, p.nameEn, p.aliases]),
    ).toEqual([
      ['Станция', undefined, undefined],
      ['Ла-Лонья', 'La Lonja', ['Лонха-де-ла-Седа', 'La Lonja de la Seda de Valencia']],
      ['Зоопарк', undefined, undefined],
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
      rooms: {},
    })
    expect(pageFields({ ...row, roomGroups: [{ roomAmenityData: ['safe'] }] }).workspace).toBe(false)
  })

  it('reads the room groups: the area, the photos and the amenities the page lists, nothing else', () => {
    const rooms = pageRooms([
      {
        rgHash: '3502302',
        size: 15.4,
        images: [{ tmpl: 'https://cdn.ostrovok.ru/t/{size}/b.jpg' }, { tmpl: 'no size' }],
        roomAmenityData: ['air-conditioning', 'unknown-key', 'safe', 'safe'],
      },
      { rgHash: '0', size: 0, images: [], roomAmenityData: [] },
      { nameStruct: {} },
    ])
    expect(rooms['3502302']).toEqual({
      area: 15,
      photos: ['https://cdn.ostrovok.ru/t/{size}/b.jpg'],
      amenities: ['Кондиционер', 'Сейф'],
    })
    expect(rooms['0']).toEqual({ area: null, photos: [], amenities: [] })
    expect(Object.keys(rooms)).toHaveLength(2)
    expect(pageRooms(null)).toEqual({})
  })
})

describe('poiName', () => {
  it("names an airport by its own English name, not its city's, and leaves the other places", () => {
    expect(poiName({ type: 'AIRPORT', name: 'Валенсия', nameEn: 'Valencia Airport' })).toBe('Valencia Airport')
    expect(poiName({ type: 'AIRPORT', name: 'Валенсия', nameEn: '' })).toBe('Валенсия')
    expect(poiName({ type: 'POI', name: 'Зоопарк', nameEn: 'Zoo' })).toBe('Зоопарк')
  })
})
