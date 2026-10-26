# /// script
# requires-python = ">=3.11"
# dependencies = ["osmium>=4.0"]
# ///
"""Turns an OSM extract into an Overpass JSON answer for `npm run db:osm-places -- --file`, when Overpass is down.

Usage, from the repository root:
    uv run scripts/osm-pbf-to-overpass.py <valencia-latest.osm.pbf> <out.json>

Source (kept outside git, deleted after the load): the Geofabrik extract of the Comunitat Valenciana,
https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf (© OpenStreetMap contributors, ODbL 1.0).

Keeps the elements of the loader's rectangle (src/lib/geo/distance.ts `VALENCIA_BBOX`) whose tags may be of a
category of src/lib/geo/categories.ts — a loose filter, the loader classifies them itself. As Overpass gives them:
nodes with `lat`/`lon`, the ways of the shape categories (beaches, the coast, parks) with `geometry`, the other ways
and the multipolygon relations with `center` (the middle of their bounding box). Node locations are kept in a file
next to the output, not in memory, and removed at the end.
"""

import json
import os
import sys

import osmium

SOUTH, WEST, NORTH, EAST = 39.27, -0.53, 39.58, -0.27

# A superset of the categories' tags: the loader's `categorize` decides.
TAGS = {
    'amenity': {'hospital', 'clinic', 'doctors', 'pharmacy', 'bar', 'pub', 'nightclub', 'restaurant', 'fast_food', 'cafe'},
    'healthcare': {'hospital', 'clinic', 'pharmacy'},
    'shop': {'supermarket', 'convenience'},
    'railway': {'station', 'halt', 'tram_stop'},
    'highway': {'bus_stop'},
    'aeroway': {'aerodrome'},
    'natural': {'beach', 'coastline'},
    'leisure': {'park'},
    'tourism': {'attraction', 'viewpoint', 'museum'},
    'place': {'city'},
}
SHAPES = {('natural', 'beach'), ('natural', 'coastline'), ('leisure', 'park')}


def wanted(tags):
    return any(tags.get(key) in values for key, values in TAGS.items())


def is_shape(tags):
    return any(tags.get(key) == value for key, value in SHAPES)


def inside(lat, lon):
    return SOUTH <= lat <= NORTH and WEST <= lon <= EAST


def tag_dict(tags):
    return {t.k: t.v for t in tags}


class Relations(osmium.SimpleHandler):
    """First pass: the multipolygon relations of a category and their member ways."""

    def __init__(self):
        super().__init__()
        self.relations = {}
        self.member_ways = {}

    def relation(self, r):
        tags = tag_dict(r.tags)
        if tags.get('type') not in ('multipolygon', 'boundary') or not wanted(tags):
            return
        ways = [m.ref for m in r.members if m.type == 'w']
        self.relations[r.id] = {'tags': tags, 'box': None}
        for way_id in ways:
            self.member_ways.setdefault(way_id, []).append(r.id)


class Elements(osmium.SimpleHandler):
    """Second pass, with node locations: the nodes and ways of a category, and the boxes of the relations."""

    def __init__(self, relations):
        super().__init__()
        self.rel = relations
        self.out = []

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        tags = tag_dict(n.tags)
        if wanted(tags) and inside(n.location.lat, n.location.lon):
            self.out.append({'type': 'node', 'id': n.id, 'lat': n.location.lat, 'lon': n.location.lon, 'tags': tags})

    def way(self, w):
        points = [(nr.location.lat, nr.location.lon) for nr in w.nodes if nr.location.valid()]
        if not points:
            return
        for relation_id in self.rel.member_ways.get(w.id, ()):
            box = self.rel.relations[relation_id]['box']
            lats, lons = [p[0] for p in points], [p[1] for p in points]
            add = (min(lats), min(lons), max(lats), max(lons))
            self.rel.relations[relation_id]['box'] = add if box is None else (
                min(box[0], add[0]), min(box[1], add[1]), max(box[2], add[2]), max(box[3], add[3]))
        tags = tag_dict(w.tags)
        if not wanted(tags) or not any(inside(lat, lon) for lat, lon in points):
            return
        if is_shape(tags):
            geometry = [{'lat': lat, 'lon': lon} for lat, lon in points]
            self.out.append({'type': 'way', 'id': w.id, 'tags': tags, 'geometry': geometry})
        else:
            lats, lons = [p[0] for p in points], [p[1] for p in points]
            centre = {'lat': (min(lats) + max(lats)) / 2, 'lon': (min(lons) + max(lons)) / 2}
            self.out.append({'type': 'way', 'id': w.id, 'tags': tags, 'center': centre})


def main():
    if len(sys.argv) != 3:
        sys.exit('usage: uv run scripts/osm-pbf-to-overpass.py <extract.osm.pbf> <out.json>')
    source, target = sys.argv[1], sys.argv[2]
    relations = Relations()
    relations.apply_file(source)
    index = os.path.join(os.path.dirname(os.path.abspath(target)), 'nodes.idx')
    elements = Elements(relations)
    try:
        elements.apply_file(source, locations=True, idx=f'sparse_file_array,{index}')
    finally:
        if os.path.exists(index):
            os.remove(index)
    for relation_id, relation in relations.relations.items():
        box = relation['box']
        if box is None:
            continue
        centre = {'lat': (box[0] + box[2]) / 2, 'lon': (box[1] + box[3]) / 2}
        if inside(centre['lat'], centre['lon']):
            elements.out.append({'type': 'relation', 'id': relation_id, 'tags': relation['tags'], 'center': centre})
    timestamp = osmium.io.Reader(source, osmium.osm.osm_entity_bits.NOTHING).header().get('osmosis_replication_timestamp')
    with open(target, 'w') as f:
        json.dump({'version': 0.6, 'generator': 'osm-pbf-to-overpass.py', 'osm3s': {'timestamp_osm_base': timestamp},
                   'elements': elements.out}, f, ensure_ascii=False)
    print(f'{len(elements.out)} elements, {len(relations.relations)} relations of a category, written to {target}')


if __name__ == '__main__':
    main()
