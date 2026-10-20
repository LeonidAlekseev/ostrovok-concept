import { pluralRu } from '../../lib/format'

const countFormat = new Intl.NumberFormat('ru-RU')

/** "1 323 отзыва": thousands parted by a no-break space, as in prices. */
export const reviewsLabel = (count: number) =>
  `${countFormat.format(count).replace(/ /g, ' ')} ${pluralRu(count, ['отзыв', 'отзыва', 'отзывов'])}`
