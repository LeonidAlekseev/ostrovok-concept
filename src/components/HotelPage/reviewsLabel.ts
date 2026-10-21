import { pluralRu } from '../../lib/format'

const countFormat = new Intl.NumberFormat('ru-RU')

/** "1 323": thousands parted by a no-break space, as in prices. */
export const formatCount = (count: number) => countFormat.format(count).replace(/ /g, ' ')

/** "1 323 отзыва". */
export const reviewsLabel = (count: number) =>
  `${formatCount(count)} ${pluralRu(count, ['отзыв', 'отзыва', 'отзывов'])}`

/** "Основано на 1 отзыве / 21 отзыве / 5 отзывах гостей." */
export const basedOnLabel = (count: number) =>
  `Основано на ${formatCount(count)} ${pluralRu(count, ['отзыве', 'отзывах', 'отзывах'])} гостей.`

/** "На вашем языке доступен 1 отзыв / доступно 5 отзывов." */
export const ownLanguageLabel = (count: number) =>
  `На вашем языке ${pluralRu(count, ['доступен', 'доступно', 'доступно'])} ${reviewsLabel(count)}.`
