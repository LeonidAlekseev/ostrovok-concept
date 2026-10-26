-- Where each value of the geodata comes from and how sure it is, and a GeoJSON of the buildings and the noise around
-- a hotel for the maps: `select public.hotel_geo_features(39.4699, -0.3763, 300)` or `POST /rest/v1/rpc/hotel_geo_features`.
-- The provenance columns keep the datasets' own names (EUBUCCO v0.2, EEA END 2022) and values as they are; what the
-- datasets lack is not added. Filled by `scripts/load-valencia-geo.py`; `hotel_features` by `npm run db:features`.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback: `drop function if exists public.hotel_geo_features(double precision, double precision, double precision);`,
-- the 20261023120000 `hotel_geo`, then drop the added columns and `public.geo_datasets`.

-- The datasets the rows come from, one row per dataset and version; the loader writes its row before the data.
create table if not exists public.geo_datasets (
  -- `eubucco-v0.2`, `eea-noise-end2022-v01_r00`
  id text primary key,
  name text not null,
  version text not null,
  -- Where the dataset is downloaded.
  url text not null,
  -- The part of the dataset kept: «ES52, city_id ES46250».
  extract text not null,
  -- What the loader did to the geometry and the values.
  processing text not null,
  loaded_at timestamptz not null default now()
);

-- Everyone reads it, to attribute the data; only the service role writes it.
alter table public.geo_datasets enable row level security;
drop policy if exists "geo_datasets_select_all" on public.geo_datasets;
create policy "geo_datasets_select_all" on public.geo_datasets for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.geo_datasets from anon, authenticated;

-- EUBUCCO v0.2 per attribute: `*_source` is gov-spain (the Spanish cadastre), osm, msft (Microsoft footprints) or
-- estimated (EUBUCCO's model); `*_source_id(s)` are the ids of the source objects; `*_confidence` is the model's
-- confidence in the type, 0–1; `*_confidence_lower` and `*_confidence_upper` bound the estimated value. A value the
-- source gives (the cadastre's floors) has no confidence. Null: the dataset has none for the building.
alter table public.geo_buildings
  add column if not exists dataset text references public.geo_datasets (id),
  add column if not exists region_id text,
  add column if not exists type_confidence real,
  add column if not exists subtype_confidence real,
  add column if not exists height_confidence_lower real,
  add column if not exists height_confidence_upper real,
  add column if not exists floors_confidence_lower real,
  add column if not exists floors_confidence_upper real,
  add column if not exists construction_year_confidence_lower smallint,
  add column if not exists construction_year_confidence_upper smallint,
  add column if not exists geometry_source text,
  add column if not exists type_source text,
  add column if not exists subtype_source text,
  add column if not exists height_source text,
  add column if not exists floors_source text,
  add column if not exists construction_year_source text,
  add column if not exists geometry_source_id text,
  add column if not exists type_source_ids text[],
  add column if not exists subtype_source_ids text[],
  add column if not exists height_source_ids text[],
  add column if not exists floors_source_ids text[],
  add column if not exists construction_year_source_ids text[],
  add column if not exists subtype_raw text,
  -- The footprint was invalid after the reprojection and `st_makevalid` fixed it on load.
  add column if not exists made_valid boolean not null default false;

alter table public.geo_buildings
  drop constraint if exists geo_buildings_geom_check,
  drop constraint if exists geo_buildings_values_check;
-- The SRID and the type are the column's; a footprint is valid and not empty, the bounds are in order. EUBUCCO's
-- floors may lie outside their bounds (one building of Valencia), so only the order of the bounds is checked.
alter table public.geo_buildings
  add constraint geo_buildings_geom_check check (extensions.st_isvalid(geom) and not extensions.st_isempty(geom)),
  add constraint geo_buildings_values_check check (
    (height is null or height > 0)
    and (floors is null or floors > 0)
    and (type_confidence is null or type_confidence between 0 and 1)
    and (subtype_confidence is null or subtype_confidence between 0 and 1)
    and (height_confidence_lower is null or height_confidence_upper is null or height_confidence_lower <= height_confidence_upper)
    and (floors_confidence_lower is null or floors_confidence_upper is null or floors_confidence_lower <= floors_confidence_upper)
    and (construction_year_confidence_lower is null or construction_year_confidence_upper is null
      or construction_year_confidence_lower <= construction_year_confidence_upper)
  );

-- EEA END 2022 per contour: `source_feature_id` is the contour's `id` in its layer of `ES.gpkg`, `source_identifier`
-- the Reportnet delivery (its time and file), `reportnet_file_id` its number; `geom_correction` is EEA's mark that
-- it corrected the reported geometry and `geometry_error_description` what was wrong («Valid» when nothing). The
-- dataset has no time of the measurement (`measureTime_*` are empty) and no calculation method.
alter table public.geo_noise
  add column if not exists dataset text references public.geo_datasets (id),
  add column if not exists source_feature_id integer,
  add column if not exists source_identifier text,
  add column if not exists reportnet_file_id integer,
  add column if not exists geom_correction boolean,
  add column if not exists geometry_error_description text,
  -- The width of the band in dB, the uncertainty of the level: 5 for a closed band, null for an open end.
  add column if not exists band_db smallint generated always as ((db_max - db_min + 1)::smallint) stored,
  -- The contour (all its pieces) was invalid in the source or after the processing and `st_makevalid` fixed it on load.
  add column if not exists made_valid boolean not null default false;

alter table public.geo_noise
  drop constraint if exists geo_noise_geom_check,
  drop constraint if exists geo_noise_band_check;
alter table public.geo_noise
  add constraint geo_noise_geom_check check (extensions.st_isvalid(geom) and not extensions.st_isempty(geom)),
  add constraint geo_noise_band_check check (
    (db_min is not null or db_max is not null) and (db_min is null or db_max is null or db_min <= db_max)
  );

-- The provenance of the hotel's values: the sources and the bounds of the height and the floors (`geo_buildings`), the
-- source of the footprint, and the datasets of the building and the noise.
alter table public.hotel_features
  add column if not exists building_dataset text references public.geo_datasets (id),
  add column if not exists geometry_source text,
  add column if not exists height_source text,
  add column if not exists height_lower_m real,
  add column if not exists height_upper_m real,
  add column if not exists floors_source text,
  add column if not exists floors_lower real,
  add column if not exists floors_upper real,
  add column if not exists noise_dataset text references public.geo_datasets (id);

alter table public.hotel_features drop constraint if exists hotel_features_provenance_check;
alter table public.hotel_features add constraint hotel_features_provenance_check check (
  (building_id is not null or (building_dataset is null and geometry_source is null and height_source is null
    and height_lower_m is null and height_upper_m is null and floors_source is null and floors_lower is null
    and floors_upper is null))
  and (height_lower_m is null or height_upper_m is null or height_lower_m <= height_upper_m)
  and (floors_lower is null or floors_upper is null or floors_lower <= floors_upper)
  and (noise_dataset is null or lden_source is not null or lnight_source is not null)
);

-- As in 20261023120000, plus the provenance: of the building's height and floors, of each band, and the datasets.
create or replace function public.hotel_geo(lat double precision, lon double precision)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (select extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) as g),
  b as (
    select b.*, extensions.st_distance(b.geom::extensions.geography, p.g::extensions.geography) as distance_m
    from public.geo_buildings b, p
    order by b.geom operator(extensions.<->) p.g
    limit 1
  ),
  n as (
    select distinct on (n.source, n.indicator)
      n.source, n.indicator, n.db_min, n.db_max, n.band_db, n.category, n.dataset
    from public.geo_noise n, p
    where extensions.st_intersects(n.geom, p.g)
    order by n.source, n.indicator, n.db_min desc nulls last
  ),
  building as (
    select jsonb_build_object(
      'id', b.id, 'type', b.type, 'subtype', b.subtype, 'height', b.height, 'floors', b.floors,
      'construction_year', b.construction_year, 'distance_m', round(b.distance_m::numeric, 1),
      'dataset', b.dataset, 'geometry_source', b.geometry_source,
      'height_source', b.height_source, 'height_confidence_lower', b.height_confidence_lower,
      'height_confidence_upper', b.height_confidence_upper,
      'floors_source', b.floors_source, 'floors_confidence_lower', b.floors_confidence_lower,
      'floors_confidence_upper', b.floors_confidence_upper,
      'construction_year_source', b.construction_year_source
    ) as value, b.dataset
    from b where b.distance_m <= 50
  )
  select jsonb_build_object(
    'building', (select value from building),
    'noise', coalesce((select jsonb_agg(to_jsonb(n) order by n.indicator, n.source) from n), '[]'::jsonb),
    'loudest', coalesce((
      select jsonb_object_agg(x.indicator, x.band)
      from (
        select distinct on (n.indicator) n.indicator,
          jsonb_build_object(
            'source', n.source, 'db_min', n.db_min, 'db_max', n.db_max, 'band_db', n.band_db,
            'category', n.category, 'dataset', n.dataset
          ) as band
        from n
        order by n.indicator, n.db_min desc nulls last, n.db_max desc nulls first
      ) x
    ), '{}'::jsonb),
    'datasets', coalesce((
      select jsonb_object_agg(d.id, jsonb_build_object('name', d.name, 'version', d.version, 'url', d.url))
      from public.geo_datasets d
      where d.id in (select building.dataset from building union select n.dataset from n)
    ), '{}'::jsonb)
  );
$$;

revoke execute on function public.hotel_geo(double precision, double precision) from public;
grant execute on function public.hotel_geo(double precision, double precision) to anon, authenticated, service_role;

-- The buildings and the noise bands within `radius_m` of the point, for the maps of the hotel page (extruded
-- buildings, the noise around): a GeoJSON FeatureCollection, EPSG:4326, coordinates to 6 decimals (~0.1 m).
-- A building feature (`layer: building`) is the whole footprint of a building touching the circle, with the
-- height and floors, their bounds and sources; a noise feature (`layer: noise`) is one band of one source and
-- indicator, merged and cut to the circle. The radius is 300 m by default, 1–500 m: in the centre of Valencia 500 m
-- is ~1 400 buildings, ~2 MB and ~1 s, while 1000 m (~8 MB, ~8 s) outlasts the anon role's 3 s statement timeout.
-- Outside the city or with coordinates out of range: no features. The `datasets` member names the sources to attribute.
create or replace function public.hotel_geo_features(
  lat double precision,
  lon double precision,
  radius_m double precision default 300
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) as g,
           least(greatest(coalesce(radius_m, 300), 1), 500) as r
    where lat between -90 and 90 and lon between -180 and 180
  ),
  c as (
    select p.g, p.r, extensions.st_buffer(p.g::extensions.geography, p.r, 16)::extensions.geometry as circle
    from p
  ),
  b as (
    select b.*, extensions.st_distance(b.geom::extensions.geography, c.g::extensions.geography) as distance_m
    from public.geo_buildings b, c
    where extensions.st_intersects(b.geom, c.circle)
  ),
  n as (
    select x.source, x.indicator, x.db_min, x.db_max, x.band_db, x.category, x.dataset,
           extensions.st_collectionextract(extensions.st_union(x.geom), 3) as geom
    from (
      select n.source, n.indicator, n.db_min, n.db_max, n.band_db, n.category, n.dataset,
             extensions.st_collectionextract(extensions.st_intersection(n.geom, c.circle), 3) as geom
      from public.geo_noise n, c
      where extensions.st_intersects(n.geom, c.circle)
    ) x
    where not extensions.st_isempty(x.geom)
    group by x.source, x.indicator, x.db_min, x.db_max, x.band_db, x.category, x.dataset
  ),
  f as (
    select 0 as layer, n.indicator || n.source || coalesce(n.db_min, -1) as sort, jsonb_build_object(
      'type', 'Feature',
      'geometry', extensions.st_asgeojson(n.geom, 6)::jsonb,
      'properties', jsonb_build_object(
        'layer', 'noise', 'source', n.source, 'indicator', n.indicator, 'db_min', n.db_min, 'db_max', n.db_max,
        'band_db', n.band_db, 'category', n.category, 'dataset', n.dataset
      )
    ) as feature
    from n
    union all
    select 1, lpad(round(b.distance_m)::text, 6, '0') || b.id, jsonb_build_object(
      'type', 'Feature',
      'id', b.id,
      'geometry', extensions.st_asgeojson(b.geom, 6)::jsonb,
      'properties', jsonb_build_object(
        'layer', 'building', 'id', b.id, 'type', b.type, 'subtype', b.subtype,
        'height', b.height, 'floors', b.floors, 'construction_year', b.construction_year,
        'distance_m', round(b.distance_m::numeric, 1), 'dataset', b.dataset, 'geometry_source', b.geometry_source,
        'height_source', b.height_source, 'height_confidence_lower', b.height_confidence_lower,
        'height_confidence_upper', b.height_confidence_upper,
        'floors_source', b.floors_source, 'floors_confidence_lower', b.floors_confidence_lower,
        'floors_confidence_upper', b.floors_confidence_upper
      )
    )
    from b
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'center', (select jsonb_build_array(lon, lat) from p),
    'radius_m', (select p.r from p),
    'features', coalesce((select jsonb_agg(f.feature order by f.layer, f.sort) from f), '[]'::jsonb),
    'datasets', coalesce((
      select jsonb_object_agg(d.id, jsonb_build_object('name', d.name, 'version', d.version, 'url', d.url))
      from public.geo_datasets d
      where d.id in (select b.dataset from b union select n.dataset from n)
    ), '{}'::jsonb)
  );
$$;

revoke execute on function public.hotel_geo_features(double precision, double precision, double precision) from public;
grant execute on function public.hotel_geo_features(double precision, double precision, double precision)
  to anon, authenticated, service_role;
