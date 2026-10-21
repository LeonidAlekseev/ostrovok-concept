import { describe, expect, it } from 'vitest'
import { CLUSTER_RADIUS, clusterPoints, expansionZoom, MAX_CLUSTER_ZOOM, project } from './mapClusters'

const point = (id: string, lon: number, lat: number, price: number) => ({ hotel: { id, lon, lat }, price })

// Four hotels in the centre of Prague within a few hundred metres, one across the river.
const centre = [
  point('a', 14.42, 50.087, 12000),
  point('b', 14.421, 50.0875, 8000),
  point('c', 14.4215, 50.0868, 9500),
  point('d', 14.4205, 50.0872, 15000),
]
const across = point('e', 14.4, 50.08, 7000)

describe('project', () => {
  it('doubles the pixel distance with every zoom step', () => {
    const [x1, y1] = project(14.42, 50.087, 10)
    const [x2, y2] = project(14.42, 50.087, 11)
    expect(x2).toBeCloseTo(x1 * 2)
    expect(y2).toBeCloseTo(y1 * 2)
  })
})

// search-results-page, Requirement: Карта результатов поиска, Scenario: Группа
describe('clusterPoints', () => {
  it('groups four close hotels into one marker with their number and the cheapest price', () => {
    const clusters = clusterPoints([...centre, across], 13)
    const group = clusters.find((c) => c.members.length > 1)!
    expect(group.members.map((m) => m.hotel.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(group.price).toBe(8000)
    expect(clusters.find((c) => c.members.length === 1)!.key).toBe('e')
  })

  it('keeps every hotel apart when zoomed in far enough', () => {
    const clusters = clusterPoints(centre, 18)
    expect(clusters).toHaveLength(4)
    expect(clusters.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('makes the same groups whatever the order of the list', () => {
    const keys = (list: typeof centre) => clusterPoints(list, 15).map((c) => c.key)
    expect(keys([...centre].reverse())).toEqual(keys(centre))
  })

  it('places a group at the mean position of its members', () => {
    const [group] = clusterPoints(centre, 10)
    expect(group.lon).toBeCloseTo((14.42 + 14.421 + 14.4215 + 14.4205) / 4)
    expect(group.lat).toBeCloseTo((50.087 + 50.0875 + 50.0868 + 50.0872) / 4)
  })

  it('groups only markers closer than the radius', () => {
    const [x, y] = project(14.42, 50.087, 12)
    const near = [
      point('a', 14.42, 50.087, 1),
      point('b', 14.42 + ((CLUSTER_RADIUS - 1) / (512 * 2 ** 12)) * 360, 50.087, 1),
    ]
    const far = [near[0], point('c', 14.42 + ((CLUSTER_RADIUS + 1) / (512 * 2 ** 12)) * 360, 50.087, 1)]
    expect(project(near[1].hotel.lon, 50.087, 12)[0] - x).toBeCloseTo(CLUSTER_RADIUS - 1)
    expect(y).toBeGreaterThan(0)
    expect(clusterPoints(near, 12)).toHaveLength(1)
    expect(clusterPoints(far, 12)).toHaveLength(2)
  })
})

describe('expansionZoom', () => {
  it('is the first whole zoom at which the group parts', () => {
    const zoom = expansionZoom(centre, 13.4)
    expect(zoom).toBeGreaterThan(13)
    expect(clusterPoints(centre, zoom).length).toBeGreaterThan(1)
    expect(clusterPoints(centre, zoom - 1)).toHaveLength(1)
  })

  it('stops at the highest zoom for hotels on one spot', () => {
    expect(expansionZoom([point('a', 1, 1, 1), point('b', 1, 1, 2)], 10)).toBe(MAX_CLUSTER_ZOOM)
  })
})
