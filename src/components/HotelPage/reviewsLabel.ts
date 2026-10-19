import { pluralRu } from '../../lib/format'

export const reviewsLabel = (count: number) => `${count} ${pluralRu(count, ['отзыв', 'отзыва', 'отзывов'])}`
