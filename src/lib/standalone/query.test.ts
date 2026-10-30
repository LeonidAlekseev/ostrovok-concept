import { describe, expect, it } from 'vitest'
import { queryClient, type Row } from './query'
import { Db } from './store'
import { standaloneFunctions } from './functions'

const base: Record<string, Row[]> = {
  hotels: [
    { id: 'ota-1', position: 2, data: { name: 'Один', stars: 4 } },
    { id: 'ota-2', position: null, data: { name: 'Два', stars: 3 } },
    { id: 'ota-3', position: 1, data: { name: 'Три', stars: 5 } },
  ],
  entities: [
    { id: 'e1', kind: 'hotel', ref: 'ota-1', hotel_id: 'ota-1' },
    { id: 'e2', kind: 'room', ref: 'r', hotel_id: 'ota-1' },
  ],
  claims: [
    { id: 'c1', entity_id: 'e1', property: 'noise.day', valid_to: null, value_numeric: 50 },
    { id: 'c2', entity_id: 'e2', property: 'noise.night', valid_to: '2020-01-01T00:00:00+00:00', value_numeric: 40 },
    { id: 'c3', entity_id: 'e1', property: 'hotelier.beds', valid_to: '2999-01-01T00:00:00.000Z', value_numeric: null },
  ],
  claim_evidence: [{ claim_id: 'c1', evidence_id: 'v1', role: 'supports' }],
  evidence: [{ id: 'v1', title: 'EEA' }],
}

const client = () => {
  const db = new Db((t) => base[t] ?? [], {}, standaloneFunctions({}), { userId: null, service: false })
  return { db, ...queryClient(db) }
}

describe('the select', () => {
  it('takes aliases and JSON paths, text and JSON', async () => {
    const { data } = await client().from('hotels').select('id, name:data->>name, stars:data->stars').eq('id', 'ota-3')
    expect(data).toEqual([{ id: 'ota-3', name: 'Три', stars: 5 }])
  })

  it('embeds the tables of the foreign keys, an inner one dropping the rows without a match', async () => {
    const { data } = await client()
      .from('claims')
      .select('id, claim_evidence(role, evidence(title)), entity:entities!inner(kind)')
      .eq('entity.kind', 'hotel')
      .order('id')
    expect(data).toEqual([
      { id: 'c1', claim_evidence: [{ role: 'supports', evidence: { title: 'EEA' } }], entity: { kind: 'hotel' } },
      { id: 'c3', claim_evidence: [], entity: { kind: 'hotel' } },
    ])
  })
})

describe('the filters and the order', () => {
  it('reads an `or` of times and nulls, as PostgREST does', async () => {
    const { data } = await client()
      .from('claims')
      .select('id')
      .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
      .like('property', '%.%')
    expect(data).toEqual([{ id: 'c1' }, { id: 'c3' }])
  })

  it('orders with the nulls last when asked, and pages', async () => {
    const { data } = await client().from('hotels').select('id').order('position', { nullsFirst: false }).range(0, 1)
    expect(data).toEqual([{ id: 'ota-3' }, { id: 'ota-1' }])
  })

  it('fails `single` on no row and gives `null` for `maybeSingle`', async () => {
    expect((await client().from('hotels').select('id').eq('id', 'none').single()).error?.code).toBe('PGRST116')
    expect((await client().from('hotels').select('id').eq('id', 'none').maybeSingle()).data).toBeNull()
  })
})

describe('the writes', () => {
  it('upserts by the conflict columns and records the change, the snapshot untouched', async () => {
    const { db, from } = client()
    await from('entities').upsert(
      { kind: 'hotel', ref: 'ota-1', hotel_id: 'ota-1', name: 'X' },
      { onConflict: 'kind,ref' },
    )
    await from('entities').insert({ kind: 'room', ref: 'new', hotel_id: 'ota-2' })
    const rows = db.all('entities')
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.id === 'e1')?.name).toBe('X')
    expect(Object.keys(db.changes.entities)).toHaveLength(2)
    expect(base.entities[0].name).toBeUndefined()
  })

  it('deletes into the overlay with a `null`', async () => {
    const { db, from } = client()
    await from('claims').delete().eq('id', 'c2')
    expect(db.all('claims').map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(db.changes.claims).toEqual({ c2: null })
  })
})
