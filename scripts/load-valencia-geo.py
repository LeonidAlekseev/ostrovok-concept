# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb>=1.4", "psycopg[binary]>=3.2"]
# ///
"""Fills public.geo_buildings and public.geo_noise for the city of Valencia, with the datasets' provenance
(migrations 20261023120000_valencia_geo, 20261026120500_geo_data_provenance), and public.geo_coverage, where the
buildings are known (20261027170000_hotel_view_coverage).

Usage, from the repository root, after `npm run db:push`; the buildings first, the noise is cut to their extent:
    uv run scripts/load-valencia-geo.py buildings [<ES52.parquet>]
    uv run scripts/load-valencia-geo.py noise <ES.gpkg>
    uv run scripts/load-valencia-geo.py coverage

Sources (kept outside git):
    buildings  EUBUCCO v0.2, region ES52 (Comunidad Valenciana), https://eubucco.com/data/download/v0.2: building
               footprints with height, floors, construction year and, per value, its source, source ids and
               confidence bounds, EPSG:3035. Read from S3 (s3://eubucco/v0.2/buildings/parquet/nuts_id=ES52/ES52.parquet,
               anonymous, s3.eubucco.com) when no path is given, else from a local copy; DuckDB reads only the rows of
               the city of Valencia (city_id ES46250).
    noise      EEA noise contours of the Environmental Noise Directive, round 2022, Spain (ES.gpkg from
               https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00),
               one layer per source and indicator, EPSG:3035; cut to the extent of the city's buildings plus 300 m.
    coverage   OpenStreetMap's boundaries (© OpenStreetMap contributors, ODbL 1.0) of the municipality of València
               (relation 344953, ine:municipio 46250, from IGN) and of the province of Valencia (relation 349000), as
               Nominatim's /lookup assembles them: the buildings are known within the municipality; the province's land
               around it within ~0.3° has none; neither is the sea, where no building stands.

The footprints are only reprojected; `st_makevalid` fixes a geometry only where it is invalid, and the row says so
(`made_valid`). The noise contours are simplified by 2 m (the bands are 5 dB wide) and subdivided into pieces of at
most 256 vertices. Each command writes its dataset to public.geo_datasets and replaces its table in one transaction;
afterwards `npm run db:features`. SUPABASE_DB_URL comes from the environment or .env and is never printed.
"""

import json
import os
import sys
import urllib.request

import duckdb
import psycopg

CITY_ID = 'ES46250'
EUBUCCO_S3 = 's3://eubucco/v0.2/buildings/parquet/nuts_id=ES52/ES52.parquet'
MARGIN_M = 300
SIMPLIFY_M = 2
TO_WGS84 = "'EPSG:3035', 'EPSG:4326', always_xy := true"

BUILDINGS = {
    'id': 'eubucco-v0.2',
    'name': 'EUBUCCO',
    'version': 'v0.2',
    'url': 'https://eubucco.com/data/download/v0.2',
    'extract': f'region nuts_id=ES52 ({EUBUCCO_S3}), city_id {CITY_ID}',
    'processing': 'EPSG:3035 to EPSG:4326 (DuckDB ST_Transform), Polygon to MultiPolygon; st_makevalid only where '
    'invalid (made_valid); values and provenance as in the dataset',
}
NOISE = {
    'id': 'eea-noise-end2022-v01_r00',
    'name': 'EEA noise contours, Environmental Noise Directive, round 2022',
    'version': 'v01_r00',
    'url': 'https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00',
    'extract': f'ES.gpkg, all layers, cut to the extent of the buildings of city_id {CITY_ID} plus {MARGIN_M} m',
    'processing': f'st_makevalid, cut, simplified by {SIMPLIFY_M} m (EPSG:3035), EPSG:4326, subdivided into pieces '
    'of at most 256 vertices; made_valid marks a contour invalid in the source or after the processing',
}

# The boundaries of the coverage: OSM relations, the project's User-Agent (src/lib/geo/http.ts).
MUNICIPALITY_RELATION = 344953
PROVINCE_RELATION = 349000
USER_AGENT = 'ostrovok-concept/1.0 (+https://github.com/LeonidAlekseev/ostrovok-concept)'
# The province's land kept around the municipality: the lines of sight are at most 6 km long.
AROUND_DEG = 0.3

# The provenance columns of EUBUCCO v0.2, loaded under their own names.
BUILDING_COLUMNS = [
    'id', 'region_id', 'type', 'subtype', 'height', 'floors', 'construction_year',
    'type_confidence', 'subtype_confidence', 'height_confidence_lower', 'height_confidence_upper',
    'floors_confidence_lower', 'floors_confidence_upper',
    'construction_year_confidence_lower', 'construction_year_confidence_upper',
    'geometry_source', 'type_source', 'subtype_source', 'height_source', 'floors_source', 'construction_year_source',
    'geometry_source_id', 'type_source_ids', 'subtype_source_ids', 'height_source_ids', 'floors_source_ids',
    'construction_year_source_ids', 'subtype_raw',
]
BUILDING_TYPES = {
    'type_confidence': 'real', 'subtype_confidence': 'real',
    'height': 'real', 'floors': 'real', 'height_confidence_lower': 'real', 'height_confidence_upper': 'real',
    'floors_confidence_lower': 'real', 'floors_confidence_upper': 'real',
    'construction_year': 'smallint', 'construction_year_confidence_lower': 'smallint',
    'construction_year_confidence_upper': 'smallint',
}


def db_url():
    url = os.environ.get('SUPABASE_DB_URL')
    if not url and os.path.exists('.env'):
        for line in open('.env'):
            if line.startswith('SUPABASE_DB_URL='):
                url = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not url:
        sys.exit('SUPABASE_DB_URL is not set: run npm run secrets:reveal')
    return url


def duck(s3=False):
    con = duckdb.connect()
    con.sql('INSTALL spatial; LOAD spatial;')
    if s3:
        # EUBUCCO's bucket is public: anonymous, path-style.
        con.sql("""
            INSTALL httpfs; LOAD httpfs;
            SET s3_endpoint = 's3.eubucco.com'; SET s3_url_style = 'path'; SET s3_region = 'eu';
            SET s3_access_key_id = ''; SET s3_secret_access_key = '';
        """)
    return con


def write_dataset(cur, dataset):
    cur.execute(
        """
        insert into public.geo_datasets (id, name, version, url, extract, processing, loaded_at)
        values (%(id)s, %(name)s, %(version)s, %(url)s, %(extract)s, %(processing)s, now())
        on conflict (id) do update set name = excluded.name, version = excluded.version, url = excluded.url,
          extract = excluded.extract, processing = excluded.processing, loaded_at = excluded.loaded_at
        """,
        dataset,
    )


def analyze(table):
    with psycopg.connect(db_url(), autocommit=True) as conn:
        conn.execute(f'analyze {table}')


def load_buildings(path):
    con = duck(s3=path.startswith('s3://'))
    # Every column but the geometry, decimals as doubles; the filter is pushed down to the parquet row groups.
    columns = ', '.join(f'{c}::DOUBLE' if BUILDING_TYPES.get(c) == 'real' else c for c in BUILDING_COLUMNS)
    rows = con.sql(f"""
        SELECT {columns}, ST_AsWKB(ST_Transform(geometry, {TO_WGS84}))
        FROM read_parquet('{path}') WHERE city_id = '{CITY_ID}'
    """).fetchall()
    if not rows:
        sys.exit(f'no buildings of {CITY_ID} in {path}')

    types = ', '.join(f'{c} {BUILDING_TYPES.get(c, "text[]" if c.endswith("_ids") else "text")}' for c in BUILDING_COLUMNS)
    names = ', '.join(BUILDING_COLUMNS)
    with psycopg.connect(db_url()) as conn, conn.cursor() as cur:
        cur.execute("set local statement_timeout = '30min'")
        write_dataset(cur, BUILDINGS)
        cur.execute(f'create temp table b ({types}, wkb bytea) on commit drop')
        with cur.copy(f'copy b ({names}, wkb) from stdin') as copy:
            for row in rows:
                copy.write_row(row)
        cur.execute('truncate public.geo_buildings')
        cur.execute(f"""
            insert into public.geo_buildings ({names}, geom, made_valid, dataset)
            select {names},
                   case when extensions.st_isvalid(g) then g
                        else extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(g), 3)) end,
                   not extensions.st_isvalid(g), %s
            from (select b.*, extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromwkb(wkb), 4326)) g from b) b
        """, (BUILDINGS['id'],))
        cur.execute("""
            select count(*), count(*) filter (where made_valid), count(height_confidence_lower),
                   count(*) filter (where height_source = 'estimated')
            from public.geo_buildings
        """)
        print('buildings, made valid, with height bounds, estimated heights:', cur.fetchone())
    analyze('public.geo_buildings')


def load_noise(path):
    with psycopg.connect(db_url()) as conn:
        extent = conn.execute(f"""
            select extensions.st_xmin(e), extensions.st_ymin(e), extensions.st_xmax(e), extensions.st_ymax(e)
            from (select extensions.st_extent(extensions.st_transform(geom, 3035)) e
                  from public.geo_buildings where dataset = '{BUILDINGS['id']}') x
        """).fetchone()
    if extent is None or extent[0] is None:
        sys.exit('no buildings in public.geo_buildings: load them first (buildings)')
    xmin, ymin, xmax, ymax = extent
    env = f'ST_MakeEnvelope({xmin - MARGIN_M}, {ymin - MARGIN_M}, {xmax + MARGIN_M}, {ymax + MARGIN_M})'

    con = duck()
    layers = [r[0] for r in con.sql(f"SELECT unnest(layers).name FROM ST_Read_Meta('{path}')").fetchall()]
    rows = []
    for layer in layers:
        rows += con.sql(f"""
            SELECT source, category, id, sourceIdentifier, reportNetEnvelopeFileId, geom_correction::BOOLEAN,
                   geometry_error_description, NOT valid, ST_AsWKB(ST_Transform(g, {TO_WGS84}))
            FROM (
                SELECT *, ST_IsValid(geom) valid,
                       ST_SimplifyPreserveTopology(ST_CollectionExtract(ST_Intersection(ST_MakeValid(geom), {env}), 3), {SIMPLIFY_M}) g
                FROM ST_Read('{path}', layer = '{layer}')
                WHERE ST_Intersects(geom, {env})
            )
            WHERE NOT ST_IsEmpty(g)
        """).fetchall()

    with psycopg.connect(db_url()) as conn, conn.cursor() as cur:
        # Subdividing the noise contours outlasts Supabase's default statement timeout.
        cur.execute("set local statement_timeout = '30min'")
        write_dataset(cur, NOISE)
        cur.execute("""
            create temp table n (source text, category text, source_feature_id integer, source_identifier text,
              reportnet_file_id integer, geom_correction boolean, geometry_error_description text,
              source_invalid boolean, wkb bytea) on commit drop
        """)
        with cur.copy('copy n from stdin') as copy:
            for row in rows:
                copy.write_row(row)
        # Each contour made valid once: an expression beside `st_subdivide` would run again for every piece.
        cur.execute("""
            create temp table v on commit drop as
            select n.*, extensions.st_isvalid(g) valid,
                   case when extensions.st_isvalid(g) then g
                        else extensions.st_collectionextract(extensions.st_makevalid(g), 3) end geom
            from (select n.*, extensions.st_setsrid(extensions.st_geomfromwkb(n.wkb), 4326) g from n) n
        """)
        cur.execute('truncate public.geo_noise restart identity')
        # `Lden5559` → 55..59, `LdenLowerThan40` → null..39, `LnightGreaterThan70` → 70..null.
        cur.execute("""
            insert into public.geo_noise (source, indicator, db_min, db_max, category, source_feature_id,
              source_identifier, reportnet_file_id, geom_correction, geometry_error_description, made_valid, dataset, geom)
            select v.source, substring(v.category from '^(Lden|Lnight)'),
                   case when v.category ~ '\\d{4}$' then substring(v.category from '(\\d\\d)\\d\\d$')::smallint
                        when v.category ~ 'GreaterThan' then substring(v.category from '(\\d+)$')::smallint end,
                   case when v.category ~ '\\d{4}$' then substring(v.category from '(\\d\\d)$')::smallint
                        when v.category ~ 'LowerThan' then substring(v.category from '(\\d+)$')::smallint - 1 end,
                   v.category, v.source_feature_id, v.source_identifier, v.reportnet_file_id, v.geom_correction,
                   v.geometry_error_description, v.source_invalid or not v.valid, %s, s.geom
            from v, extensions.st_subdivide(v.geom, 256) as s(geom)
            where extensions.geometrytype(s.geom) = 'POLYGON'
        """, (NOISE['id'],))
        cur.execute("""
            select count(*), count(distinct (source, indicator)), count(*) filter (where made_valid),
                   count(*) filter (where geom_correction)
            from public.geo_noise
        """)
        print('noise pieces, layers, made valid, corrected by EEA:', cur.fetchone())
    analyze('public.geo_noise')


def osm_boundary(relation):
    """The GeoJSON geometry of an OSM boundary relation, as Nominatim assembles it."""
    url = f'https://nominatim.openstreetmap.org/lookup?osm_ids=R{relation}&format=geojson&polygon_geojson=1'
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        features = json.load(response)['features']
    if not features or features[0]['geometry']['type'] not in ('Polygon', 'MultiPolygon'):
        sys.exit(f'no boundary of the relation {relation}')
    return json.dumps(features[0]['geometry'])


def load_coverage():
    municipality = osm_boundary(MUNICIPALITY_RELATION)
    province = osm_boundary(PROVINCE_RELATION)
    with psycopg.connect(db_url()) as conn, conn.cursor() as cur:
        cur.execute(
            """
            with m as (select extensions.st_setsrid(extensions.st_geomfromgeojson(%(m)s), 4326) g),
            p as (select extensions.st_setsrid(extensions.st_geomfromgeojson(%(p)s), 4326) g)
            insert into public.geo_coverage (dataset, name, covered, uncovered, source, loaded_at)
            select %(dataset)s, 'València', extensions.st_multi(m.g),
              extensions.st_multi(extensions.st_collectionextract(extensions.st_difference(
                extensions.st_intersection(p.g, extensions.st_expand(extensions.st_envelope(m.g), %(around)s)), m.g), 3)),
              %(source)s, now()
            from m, p
            on conflict (dataset) do update set name = excluded.name, covered = excluded.covered,
              uncovered = excluded.uncovered, source = excluded.source, loaded_at = excluded.loaded_at
            """,
            {
                'm': municipality,
                'p': province,
                'dataset': BUILDINGS['id'],
                'around': AROUND_DEG,
                'source': f'OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0) via Nominatim: municipality of '
                f'València, relation {MUNICIPALITY_RELATION} (IGN); province of Valencia, relation {PROVINCE_RELATION}, '
                f'within {AROUND_DEG}° of the municipality, but it',
            },
        )
        cur.execute("""
            select count(*) filter (where extensions.st_intersects(extensions.st_centroid(b.geom), c.covered)),
                   count(*), round((extensions.st_area(c.covered::extensions.geography) / 1e6)::numeric, 1),
                   round((extensions.st_area(c.uncovered::extensions.geography) / 1e6)::numeric, 1)
            from public.geo_coverage c join public.geo_buildings b on b.dataset = c.dataset
            where c.dataset = %s
            group by c.covered, c.uncovered
        """, (BUILDINGS['id'],))
        print('buildings within the municipality, all, its km², the uncovered land km²:', cur.fetchone())


if __name__ == '__main__':
    command, args = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else (None, [])
    if command == 'buildings' and len(args) <= 1:
        load_buildings(args[0] if args else EUBUCCO_S3)
    elif command == 'noise' and len(args) == 1:
        load_noise(args[0])
    elif command == 'coverage' and not args:
        load_coverage()
    else:
        sys.exit(__doc__)
