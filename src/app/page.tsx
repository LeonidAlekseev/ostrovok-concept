import { HomePage } from '../components/HomePage'
import { tileHotel } from '../lib/catalog'
import { homeCollections } from '../lib/collections'
import { loadAllHotels, loadNewHotels } from '../lib/db/catalog'

export default async function Page() {
  const [newHotels, hotels] = await Promise.all([loadNewHotels(), loadAllHotels()])
  // The collections are picked over the whole catalogue here; the browser gets only the cards of their hotels.
  const collections = homeCollections(hotels).map(({ collection: { id, title, description }, hotels }) => ({
    collection: { id, title, description },
    hotels: hotels.map(tileHotel),
  }))
  return <HomePage newHotels={newHotels} collections={collections} />
}
