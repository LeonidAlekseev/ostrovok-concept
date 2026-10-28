/**
 * The Russian names of the places of Valencia that travellers ask about. Nominatim and the cache know the Spanish and
 * Valencian names, so a Russian name is turned into the official one before the search. Only real places: each name
 * is the one OpenStreetMap gives the place (checked in the cache and in Nominatim), none is made up.
 */

const PLACES: ReadonlyArray<readonly [official: string, russian: readonly string[]]> = [
  ['Ciutat de les Arts i les Ciències', ['город искусств и наук', 'город наук и искусств']],
  ['Oceanogràfic de València', ['океанографик', 'океанографический парк']],
  ["L'Hemisfèric", ['гемисферик']],
  ['Palau de les Arts Reina Sofia', ['дворец искусств королевы софии', 'дворец искусств']],
  ['Torres dels Serrans', ['башни серранос', 'башни серрано', 'ворота серранос', 'ворота серрано']],
  ['Torres de Quart', ['башни кварт', 'ворота кварт']],
  ['Catedral de València', ['кафедральный собор', 'собор валенсии', 'валенсийский собор']],
  ['el Micalet', ['микалет', 'мигелете', 'колокольня собора']],
  ['Mercat Central', ['центральный рынок', 'центральный рынок валенсии']],
  ['Llotja de la Seda', ['шёлковая биржа', 'шелковая биржа', 'ла лонха', 'лонха']],
  ['València - Estació del Nord', ['северный вокзал']],
  ['València Joaquín Sorolla', ['вокзал хоакин сорилья', 'вокзал хоакина сорильи', 'вокзал сорилья']],
  ["Plaça de l'Ajuntament", ['площадь ратуши', 'площадь аюнтамьенто']],
  ['Plaça de la Mare de Déu', ['площадь богоматери', 'площадь девы марии']],
  ['Plaça de la Reina', ['площадь королевы']],
  ['Jardí Botànic de la Universitat de València', ['ботанический сад', 'ботанический сад валенсии']],
  ['Parc de Capçalera', ['парк кабесера']],
  ["Parc Natural de l'Albufera", ['альбуфера', 'парк альбуфера', 'озеро альбуфера']],
  ['Platja de la Malva-rosa', ['пляж мальвароса', 'мальвароса', 'пляж малварроса', 'малварроса']],
  ['Platja del Cabanyal', ['пляж кабаньял']],
  ['Platja de la Patacona', ['пляж патакона', 'патакона']],
  ['Estadi de Mestalla', ['стадион местайя', 'местайя', 'мествалья', 'стадион мествалья']],
  ['Bioparc València', ['биопарк', 'биопарк валенсия']],
  ['Parc Central', ['центральный парк', 'парк сентраль']],
  ['Jardins del Real', ['королевские сады', 'вивейрос']],
  ["Institut Valencià d'Art Modern", ['ивам', 'институт современного искусства']],
  ['Plaça de Bous de València', ['арена для боя быков']],
  ['Museo Fallero de València', ['музей фальес']],
  ['Palau del Marqués de Dosaigües', ['дворец маркиза де дос агуас', 'дворец дос агуас']],
  ['La Marina de València', ['марина', 'порт валенсии', 'ла марина']],
  ['Russafa', ['русафа', 'рузафа']],
  ['el Carme', ['эль кармен', 'кармен', 'эль-кармен', 'район кармен']],
  ['el Cabanyal', ['кабаньял', 'район кабаньял']],
]

const PREPOSITIONS = new Set(['до', 'в', 'во', 'к', 'на', 'от', 'из', 'около', 'возле', 'у'])

/** Words as they are compared: lower case, «ё» as «е», only letters and digits; endings cut to three letters. */
const key = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter((word, i) => i > 0 || !PREPOSITIONS.has(word))
    .map((word) => word.slice(0, 3))
    .join(' ')

const OFFICIAL = new Map(PLACES.flatMap(([official, names]) => names.map((name) => [key(name), official] as const)))

/** The official name of a place asked by its Russian name (in any case); `undefined` for any other query. */
export function officialPlaceName(query: string): string | undefined {
  if (!/\p{Script=Cyrillic}/u.test(query)) return undefined
  return OFFICIAL.get(key(query))
}
