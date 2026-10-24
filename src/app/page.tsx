import { HomePage } from '../components/HomePage'
import { tileHotel } from '../lib/catalog'
import { loadAllHotels, loadNewHotels } from '../lib/db/catalog'
import { PERSONAS, personaHotels } from '../lib/personas'

export default async function Page() {
  // The browser gets the cards of the personas' selections only, not the catalogue they are picked from.
  const [newHotels, hotels] = await Promise.all([loadNewHotels(), loadAllHotels()])
  const selections = PERSONAS.map((persona) => ({ persona, hotels: personaHotels(hotels, persona).map(tileHotel) }))
  return <HomePage newHotels={newHotels} selections={selections} />
}
