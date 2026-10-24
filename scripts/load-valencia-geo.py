# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb>=1.4", "psycopg[binary]>=3.2"]
# ///
"""Fills public.geo_buildings and public.geo_noise (migration 20261023120000_valencia_geo) for the city of Valencia.

Usage, from the repository root, after `npm run db:push`:
    uv run scripts/load-valencia-geo.py <height_floor_ES52.parquet> <noise_ES.gpkg>

Sources (kept outside git, e.g. in data/):
    height_floor_ES52.parquet  building footprints of region ES52 with height, floors and construction year,
                               EPSG:3035; only the city of Valencia (city_id ES46250) is kept
    noise_ES.gpkg              EU strategic noise map contours of Spain (Reportnet 2022), one layer per
                               source and indicator, EPSG:3035; cut to the city's extent plus 300 m

The noise contours are simplified by 2 m (the bands are 5 dB wide) and subdivided into pieces of at most
256 vertices. Both tables are replaced in one transaction. SUPABASE_DB_URL comes from the environment or
.env.local and is never printed.
"""

import os
import sys

import duckdb
import psycopg

CITY_ID = 'ES46250'
MARGIN_M = 300
SIMPLIFY_M = 2


def db_url():
    url = os.environ.get('SUPABASE_DB_URL')
    if not url and os.path.exists('.env.local'):
        for line in open('.env.local'):
            if line.startswith('SUPABASE_DB_URL='):
                url = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not url:
        sys.exit('SUPABASE_DB_URL is not set: run npm run secrets:reveal')
    return url


def extract(buildings_path, noise_path):
    con = duckdb.connect()
    con.sql('INSTALL spatial; LOAD spatial;')
    buildings = f"read_parquet('{buildings_path}') WHERE city_id = '{CITY_ID}'"
    xmin, ymin, xmax, ymax = con.sql(
        f'SELECT min(bbox.xmin), min(bbox.ymin), max(bbox.xmax), max(bbox.ymax) FROM {buildings}'
    ).fetchall()[0]
    env = f'ST_MakeEnvelope({xmin - MARGIN_M}, {ymin - MARGIN_M}, {xmax + MARGIN_M}, {ymax + MARGIN_M})'
    to_wgs84 = "'EPSG:3035', 'EPSG:4326', always_xy := true"

    building_rows = con.sql(f"""
        SELECT id, type, subtype, height::DOUBLE, floors::DOUBLE, construction_year,
               ST_AsWKB(ST_Transform(geometry, {to_wgs84}))
        FROM {buildings}
    """).fetchall()

    layers = [r[0] for r in con.sql(f"SELECT unnest(layers).name FROM ST_Read_Meta('{noise_path}')").fetchall()]
    noise_rows = []
    for layer in layers:
        noise_rows += con.sql(f"""
            SELECT source, category, ST_AsWKB(ST_Transform(g, {to_wgs84}))
            FROM (
                SELECT source, category,
                       ST_SimplifyPreserveTopology(ST_CollectionExtract(ST_Intersection(ST_MakeValid(geom), {env}), 3), {SIMPLIFY_M}) g
                FROM ST_Read('{noise_path}', layer = '{layer}')
                WHERE ST_Intersects(geom, {env})
            )
            WHERE NOT ST_IsEmpty(g)
        """).fetchall()
    return building_rows, noise_rows


def load(building_rows, noise_rows):
    with psycopg.connect(db_url()) as conn, conn.cursor() as cur:
        # Subdividing the noise contours outlasts Supabase's default statement timeout.
        cur.execute("set local statement_timeout = '30min'")
        cur.execute('truncate public.geo_buildings, public.geo_noise')
        cur.execute(
            'create temp table b (id text, type text, subtype text, height real, floors real, year smallint, wkb bytea) on commit drop'
        )
        with cur.copy('copy b from stdin') as copy:
            for row in building_rows:
                copy.write_row(row)
        cur.execute("""
            insert into public.geo_buildings (id, type, subtype, height, floors, construction_year, geom)
            select id, type, subtype, height, floors, year,
                   extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
                     extensions.st_setsrid(extensions.st_geomfromwkb(wkb), 4326)), 3))
            from b
        """)
        cur.execute('create temp table n (source text, category text, wkb bytea) on commit drop')
        with cur.copy('copy n from stdin') as copy:
            for row in noise_rows:
                copy.write_row(row)
        # `Lden5559` → 55..59, `LdenLowerThan40` → null..39, `LnightGreaterThan70` → 70..null.
        cur.execute("""
            insert into public.geo_noise (source, indicator, db_min, db_max, category, geom)
            select n.source, substring(n.category from '^(Lden|Lnight)'),
                   case when n.category ~ '\\d{4}$' then substring(n.category from '(\\d\\d)\\d\\d$')::smallint
                        when n.category ~ 'GreaterThan' then substring(n.category from '(\\d+)$')::smallint end,
                   case when n.category ~ '\\d{4}$' then substring(n.category from '(\\d\\d)$')::smallint
                        when n.category ~ 'LowerThan' then substring(n.category from '(\\d+)$')::smallint - 1 end,
                   n.category, s.geom
            from n, extensions.st_subdivide(extensions.st_collectionextract(extensions.st_makevalid(
                   extensions.st_setsrid(extensions.st_geomfromwkb(n.wkb), 4326)), 3), 256) as s(geom)
            where extensions.geometrytype(s.geom) = 'POLYGON'
        """)
        cur.execute('select (select count(*) from public.geo_buildings), (select count(*) from public.geo_noise)')
        print('loaded buildings, noise pieces:', cur.fetchone())
    with psycopg.connect(db_url(), autocommit=True) as conn:
        conn.execute('analyze public.geo_buildings')
        conn.execute('analyze public.geo_noise')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    load(*extract(sys.argv[1], sys.argv[2]))
