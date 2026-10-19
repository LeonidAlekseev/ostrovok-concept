import { faq, type FaqItem } from '@/data/faq'
import { normalize } from './search'

/** Questions whose text or answer contains the query, ignoring case and «ё/е»; an empty query matches all. */
export function filterFaq(query: string, items: FaqItem[] = faq): FaqItem[] {
  const q = normalize(query)
  if (!q) return items
  return items.filter((item) => normalize(item.question).includes(q) || normalize(item.answer).includes(q))
}
