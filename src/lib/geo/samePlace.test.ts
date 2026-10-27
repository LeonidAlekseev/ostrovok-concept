import { describe, expect, it } from 'vitest'
import { mergeOstrovok, mergePlaces, nameWords, namesAgree, type OsmLike, type OstrovokLike } from './samePlace'

/** Real rows of `ota_hotel_places` (the kind by `placeKind`) and `osm_places`, their names and points as stored. */
const lonja: OstrovokLike = {
  name: 'Ла-Лонья',
  nameEn: 'La Lonja',
  kind: 'Достопримечательность',
  lat: 39.4741249084473,
  lon: -0.3785659968853,
}
const lonjaSeda: OstrovokLike = {
  name: 'Лонха-де-ла-Седа',
  nameEn: 'La Lonja de la Seda de Valencia',
  kind: 'Достопримечательность',
  lat: 39.4745025634766,
  lon: -0.378185003995895,
}
const llotja: OsmLike = {
  osmType: 'way',
  osmId: 23377876,
  name: 'Llotja de la Seda',
  category: 'attraction',
  lat: 39.4744082,
  lon: -0.3784312,
  tags: { 'name:en': 'Silk Exchange', 'name:es': 'Lonja de la Seda', 'name:ru': 'Шелковая биржа' },
}
const escaleras: OsmLike = {
  osmType: 'node',
  osmId: 4145181676,
  name: 'Las Escaleras de la Lonja',
  category: 'restaurant',
  lat: 39.4742441,
  lon: -0.3780803,
}
const barLonja: OsmLike = {
  osmType: 'node',
  osmId: 12071062337,
  name: 'Bar la Lonja',
  category: 'cafe',
  lat: 39.4732442,
  lon: -0.3781444,
}
const colon: OstrovokLike = {
  name: 'Рынок Колон',
  nameEn: 'Mercado de Colón',
  kind: 'Шопинг',
  lat: 39.4688186645508,
  lon: -0.369246006011963,
}
const colonMarket: OstrovokLike = {
  name: 'Рынок Колон',
  nameEn: 'Colón Market',
  kind: 'Шопинг',
  lat: 39.4688949584961,
  lon: -0.368496000766754,
}
const rice: OstrovokLike = {
  name: 'Музей риса',
  nameEn: 'Museum of Rice',
  kind: 'Музей',
  lat: 39.4630966186523,
  lon: -0.331871002912521,
}
const arros: OsmLike = {
  osmType: 'node',
  osmId: 5167202796,
  name: "Museu de l'Arròs de València",
  category: 'museum',
  lat: 39.4632842,
  lon: -0.3319217,
  tags: { 'name:ca': "Museu de l'Arròs", 'name:es': 'Museo del Arroz' },
}
const semanaSanta: OsmLike = {
  osmType: 'node',
  osmId: 5167202797,
  name: 'Casa Museo de la Semana Santa Marinera de Valencia',
  category: 'museum',
  lat: 39.4631054,
  lon: -0.3319289,
}
const palauCampo: OstrovokLike = {
  name: 'Palau del marques de campo',
  nameEn: 'Palau del marques de campo',
  kind: 'Достопримечательность',
  lat: 39.4759864807129,
  lon: -0.373735994100571,
}
const palauCampoOsm: OsmLike = {
  osmType: 'relation',
  osmId: 7286126,
  name: 'Palau del Marqués de Campo',
  category: 'attraction',
  lat: 39.476046,
  lon: -0.3737649,
  tags: { 'name:es': 'Palacio del Marques de Campo' },
}
const museuCiutat: OsmLike = {
  osmType: 'node',
  osmId: 13012356018,
  name: 'Museu de la Ciutat de València',
  category: 'museum',
  lat: 39.4760432,
  lon: -0.3737384,
  tags: { 'name:es': 'Museo de la Ciudad de Valencia' },
}
const ceramics: OstrovokLike = {
  name: 'Национальный музей керамики',
  nameEn: 'Palacio del Marques de Dos Aguas',
  kind: 'Музей',
  lat: 39.4726524353027,
  lon: -0.374543994665146,
}
const ceramicsOsm: OsmLike = {
  osmType: 'node',
  osmId: 5126811958,
  name: 'Museo Nacional de Cerámica y Artes Suntuarias González Martí',
  category: 'museum',
  lat: 39.4725239,
  lon: -0.3746678,
  tags: { 'name:ru': 'Музей керамики' },
}
const airport: OstrovokLike = {
  name: 'Валенсия',
  nameEn: 'Valencia Airport',
  kind: 'Аэропорт',
  lat: 39.4917907714844,
  lon: -0.473475009202957,
}
const airportOsm: OsmLike = {
  osmType: 'relation',
  osmId: 20242344,
  name: 'Aeropuerto Internacional de Valencia',
  category: 'airport',
  lat: 39.4882338,
  lon: -0.4826453,
}
const maritim: OstrovokLike = {
  name: 'Маритим-Серрериа',
  nameEn: 'Maritim-Serreria',
  kind: 'Станция',
  lat: 39.4648246765137,
  lon: -0.33856987953186,
}
const maritimOsm: OsmLike = {
  osmType: 'node',
  osmId: 5497241958,
  name: 'Marítim',
  category: 'metro',
  lat: 39.4648555,
  lon: -0.3386346,
  tags: { old_name: 'Marítim-Serrería' },
}
const cabecera: OstrovokLike = {
  name: 'Парк Кабесера',
  nameEn: 'Cabecera Park',
  kind: 'Парк',
  lat: 39.475399017334,
  lon: -0.40870800614357,
}
const capcalera: OsmLike = {
  osmType: 'way',
  osmId: 623955259,
  name: 'Parc de Capçalera',
  category: 'park',
  lat: 39.4772686,
  lon: -0.4083021,
  tags: { 'name:es': 'Parque de Cabecera' },
}

const names = (places: readonly { name: string | null }[]) => places.map((p) => p.name)

// assistant-geo, Requirement: Одно место Островка и OpenStreetMap
describe('one place of Ostrovok and OpenStreetMap', () => {
  it('folds the Silk Exchange, named twice by Ostrovok and once by OSM, into the first Ostrovok name', () => {
    const merged = mergePlaces([lonja, lonjaSeda], [llotja])
    expect(merged.ostrovok).toEqual([{ place: lonja, twins: [lonjaSeda], osm: [llotja] }])
    expect(merged.osm).toEqual([])
  })

  // assistant-geo, Requirement: Совместимые виды мест
  it('keeps the restaurant and the bar at the door of the Lonja: a café is never a sight', () => {
    expect(names(mergePlaces([lonja, lonjaSeda], [escaleras, barLonja, llotja]).osm)).toEqual([
      'Las Escaleras de la Lonja',
      'Bar la Lonja',
    ])
  })

  it('folds the two markets of Colón, 65 m apart', () => {
    expect(mergeOstrovok([colon, colonMarket])).toEqual([{ ...colon, aliases: ['Рынок Колон', 'Colón Market'] }])
  })

  it('finds the OSM place by the name of a folded twin: «La Lonja» alone shares no word with «Llotja»', () => {
    const untranslated = { ...llotja, tags: {} }
    expect(mergePlaces([lonja], [untranslated]).osm).toEqual([untranslated])
    expect(mergePlaces(mergeOstrovok([lonja, lonjaSeda]), [untranslated]).osm).toEqual([])
  })

  it('keeps both museums 5 and 21 m from the museum of rice: neither shares its name', () => {
    const merged = mergePlaces([rice], [semanaSanta, arros])
    expect(merged.ostrovok[0].osm).toEqual([])
    expect(names(merged.osm)).toEqual([semanaSanta.name, arros.name])
  })

  it('takes the namesake of a palace, not the museum of the city in it 6 m away', () => {
    const merged = mergePlaces([palauCampo], [museuCiutat, palauCampoOsm])
    expect(merged.ostrovok[0].osm).toEqual([palauCampoOsm])
    expect(merged.osm).toEqual([museuCiutat])
  })

  it('finds a name in the translations of OSM: «керамики», the old name of a station', () => {
    expect(mergePlaces([ceramics], [ceramicsOsm]).osm).toEqual([])
    expect(mergePlaces([maritim], [maritimOsm]).osm).toEqual([])
  })

  it('takes a park 211 m away by its name, the airport 0.9 km away by its kind', () => {
    expect(mergePlaces([cabecera], [capcalera]).osm).toEqual([])
    expect(mergePlaces([airport], [airportOsm]).osm).toEqual([])
  })

  it('folds an element found for two categories once, with its place', () => {
    const asMuseum = { ...llotja, category: 'museum' }
    const merged = mergePlaces([lonja], [llotja, asMuseum])
    expect(merged.ostrovok[0].osm).toEqual([llotja, asMuseum])
    expect(merged.osm).toEqual([])
  })

  it('never folds places of other kinds or far apart', () => {
    expect(mergeOstrovok([lonja, colon])).toEqual([lonja, colon])
    expect(mergePlaces([cabecera], [{ ...capcalera, category: 'attraction' }]).osm).toHaveLength(1)
    expect(mergePlaces([rice], [{ ...arros, lat: arros.lat + 0.001 }]).osm).toHaveLength(1)
  })
})

// assistant-geo, Requirement: Расстояние склейки
describe('the words of a name', () => {
  it('drop the accents, the kind words and the city', () => {
    expect(nameWords("Museu de l'Arròs de València")).toEqual(['arros'])
    expect(nameWords('Plaça Espanya')).toEqual(['espanya'])
  })

  it('agree on a form of a word, not on a short beginning', () => {
    expect(namesAgree(['Музей военной истории', 'Military History Museum'], ['Museo Histórico Militar'])).toBe(true)
    expect(namesAgree(['University Hospital'], ['Hospital Clínic Universitari'])).toBe(true)
    expect(namesAgree(['Museum of Rice'], ['Casa Museo de la Semana Santa Marinera'])).toBe(false)
  })
})
