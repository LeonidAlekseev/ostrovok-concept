import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '@/data/routes'
import { fullHotelsIn } from '../catalogGenerator'
import { createClient } from '../supabase/server'
import { copyRoute, tripEdits } from '../trip'
import { createTrip, deleteTrip, listTrips, loadTrip, saveTrip } from './trips'

vi.mock('./catalog', () => import('@/test/catalog'))
vi.mock('../supabase/server', () => ({ createClient: vi.fn() }))

const ID = '7c0b4a52-6c1e-4f43-9d2a-0d6f6f1f2a10'
const trip = copyRoute(seedRoutes[0], '2026-11-02')

/** A table of the owner's rows behind a query builder: RLS is the filter by `owner`. */
function fakeSupabase(rows: { id: string; user_id: string; data: unknown; updated_at: string }[], user: string | null) {
  const calls: { op: string; values?: unknown }[] = []
  const visible = () => rows.filter((row) => row.user_id === user)
  const query = (op: string, values?: unknown) => {
    calls.push({ op, values })
    let picked = visible()
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (_: string, value: string) => {
        picked = picked.filter((row) => row.id === value)
        return builder
      },
      maybeSingle: async () => ({ data: picked[0] ?? null, error: null }),
      single: async () => ({ data: { id: ID }, error: null }),
      then: (resolve: (value: unknown) => void) => {
        if (op === 'update') for (const row of picked) row.data = (values as { data: unknown }).data
        if (op === 'delete') for (const row of picked) rows.splice(rows.indexOf(row), 1)
        resolve({ data: picked, error: null })
      },
    }
    return builder
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from: () => ({
      select: () => query('select').select(),
      insert: (values: unknown) => query('insert', values),
      update: (values: unknown) => query('update', values),
      delete: () => query('delete'),
    }),
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { calls, rows }
}

const stored = () => [{ id: ID, user_id: 'owner', data: structuredClone(trip), updated_at: '2026-11-02T10:00:00Z' }]

beforeEach(() => vi.mocked(createClient).mockReset())

// trip-plan, Requirement: Копия маршрута
describe('the trips of the user', () => {
  it('reads the owner’s plan with its hotels; someone else, a guest or a malformed id get nothing', async () => {
    fakeSupabase(stored(), 'owner')
    const loaded = await loadTrip(ID)
    expect(loaded?.trip).toEqual(trip)
    expect(Object.keys(loaded!.hotels).sort()).toEqual(trip.stops.map((s) => s.hotelId).sort())
    fakeSupabase(stored(), 'other')
    expect(await loadTrip(ID)).toBeNull()
    fakeSupabase(stored(), null)
    expect(await loadTrip(ID)).toBeNull()
    const { calls } = fakeSupabase(stored(), 'owner')
    expect(await loadTrip('not-a-uuid')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('creates a plan of the signed-in user only', async () => {
    const { calls } = fakeSupabase([], 'owner')
    expect(await createTrip('prague-culture', trip)).toBe(ID)
    expect(calls[0]).toMatchObject({ op: 'insert', values: { user_id: 'owner', route_id: 'prague-culture' } })
    fakeSupabase([], null)
    expect(await createTrip('prague-culture', trip)).toBeNull()
  })

  // trip-plan, Requirement: Правки плана (Scenario: Сохранение)
  it('saves the edits over the stored route, never a route from the browser', async () => {
    const { rows } = fakeSupabase(stored(), 'owner')
    const edits = { ...tripEdits(trip), stops: [{ ...trip.stops[0], nights: 4 }, trip.stops[1]], route: { title: 'x' } }
    expect(await saveTrip(ID, edits)).toBe(true)
    const saved = rows[0].data as typeof trip
    expect(saved.stops[0].nights).toBe(4)
    expect(saved.route).toEqual(trip.route)
  })

  it('rejects a hotel of another city and malformed edits', async () => {
    fakeSupabase(stored(), 'owner')
    const rome = fullHotelsIn('rome')[0]
    const edits = { ...tripEdits(trip), stops: [{ hotelId: rome.id, nights: 3 }, trip.stops[1]] }
    await expect(saveTrip(ID, edits)).rejects.toThrow('отель другого города')
    await expect(saveTrip(ID, { ...tripEdits(trip), start: 'tomorrow' })).rejects.toThrow('План не прошёл проверку')
  })

  it('does not save or delete someone else’s plan', async () => {
    const { rows } = fakeSupabase(stored(), 'other')
    expect(await saveTrip(ID, tripEdits(trip))).toBe(false)
    expect(await deleteTrip(ID)).toBe(false)
    expect(rows).toHaveLength(1)
    fakeSupabase(rows, 'owner')
    expect(await deleteTrip(ID)).toBe(true)
    expect(rows).toHaveLength(0)
  })

  it('lists the plans of the user and leaves out a malformed one', async () => {
    fakeSupabase([...stored(), { id: 'b', user_id: 'owner', data: { route: {} }, updated_at: '' }], 'owner')
    const { trips, hotels } = await listTrips()
    expect(trips.map((t) => t.id)).toEqual([ID])
    expect(Object.keys(hotels)).toHaveLength(2)
  })
})
