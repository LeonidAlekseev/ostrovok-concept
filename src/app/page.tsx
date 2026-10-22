import { HomePage } from '../components/HomePage'
import { loadNewHotels } from '../lib/db/catalog'
import { loadRouteCards } from '../lib/db/routes'

export default async function Page() {
  // The browser gets the routes' cards only, with the estimates of their pages.
  const [newHotels, routes] = await Promise.all([loadNewHotels(), loadRouteCards()])
  return <HomePage newHotels={newHotels} routes={routes} />
}
