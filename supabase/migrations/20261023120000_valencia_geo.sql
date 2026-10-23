-- Building heights and environmental noise for the city of Valencia (municipality ES46250), looked up by the
-- hotel's coordinates: `select public.hotel_geo(39.4699, -0.3763)` or `POST /rest/v1/rpc/hotel_geo`.
-- The tables are filled by `scripts/load-valencia-geo.py` from the open datasets (see its header).
-- Idempotent: safe to re-run on a database that already has these objects.

create extension if not exists postgis with schema extensions;

-- One row per building footprint (dataset `height_floor_ES52`, region ES52, cut to the city).
create table if not exists public.geo_buildings (
  id text primary key,
  type text,
  subtype text,
  -- Metres above ground and the floor count, both estimated by the dataset.
  height real,
  floors real,
  construction_year smallint,
  geom extensions.geometry(MultiPolygon, 4326) not null
);

create index if not exists geo_buildings_geom_idx on public.geo_buildings using gist (geom);

-- Strategic noise map contours (EU Environmental Noise Directive, round 2022), cut to the city and
-- subdivided so a point lookup touches small polygons. A row is a piece of one 5 dB band of one source.
create table if not exists public.geo_noise (
  id bigint generated always as identity primary key,
  -- roadsInAgglomeration, majorRoadsIncludingAgglomeration, railwaysInAgglomeration, industryInAgglomeration, …
  source text not null,
  -- Lden: day-evening-night level over 24 h; Lnight: night level, 23:00–07:00.
  indicator text not null check (indicator in ('Lden', 'Lnight')),
  -- The band in dB: `Lden5559` is 55–59; the open ends are null (`LdenLowerThan40` is null–39).
  db_min smallint,
  db_max smallint,
  category text not null,
  geom extensions.geometry(Polygon, 4326) not null
);

create index if not exists geo_noise_geom_idx on public.geo_noise using gist (geom);

-- Nobody reads the tables directly: `hotel_geo` is the way in. Only the service role writes them.
alter table public.geo_buildings enable row level security;
alter table public.geo_noise enable row level security;
revoke all on public.geo_buildings, public.geo_noise from anon, authenticated;

-- The building at the point (the one containing it, else the nearest within 50 m) and the noise bands the
-- point lies in, per source and indicator, plus the loudest band per indicator. Outside the city both are empty.
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
    select distinct on (n.source, n.indicator) n.source, n.indicator, n.db_min, n.db_max, n.category
    from public.geo_noise n, p
    where extensions.st_intersects(n.geom, p.g)
    order by n.source, n.indicator, n.db_min desc nulls last
  )
  select jsonb_build_object(
    'building', (
      select jsonb_build_object(
        'id', b.id, 'type', b.type, 'subtype', b.subtype, 'height', b.height, 'floors', b.floors,
        'construction_year', b.construction_year, 'distance_m', round(b.distance_m::numeric, 1)
      )
      from b where b.distance_m <= 50
    ),
    'noise', coalesce((select jsonb_agg(to_jsonb(n) order by n.indicator, n.source) from n), '[]'::jsonb),
    'loudest', coalesce((
      select jsonb_object_agg(x.indicator, x.band)
      from (
        select distinct on (n.indicator) n.indicator,
          jsonb_build_object('source', n.source, 'db_min', n.db_min, 'db_max', n.db_max, 'category', n.category) as band
        from n
        order by n.indicator, n.db_min desc nulls last, n.db_max desc nulls first
      ) x
    ), '{}'::jsonb)
  );
$$;

revoke execute on function public.hotel_geo(double precision, double precision) from public;
grant execute on function public.hotel_geo(double precision, double precision) to anon, authenticated, service_role;
