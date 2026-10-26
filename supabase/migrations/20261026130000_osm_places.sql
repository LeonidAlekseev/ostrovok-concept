-- Places of OpenStreetMap around the hotels, for Эвал's answers «есть ли рядом аптека», «сколько до моря»
-- (src/lib/geo). Valencia is loaded in advance by `npm run db:osm-places`; what the cache does not cover is asked of
-- Overpass online by the server and written here for good: no expiry, nothing is deleted.
-- Read with `select public.osm_places_near(39.4699, -0.3763, 800, array['pharmacy', 'bar'], 5)`; only the service
-- role writes. Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (the geo tools answer «не удалось проверить» without the cache):
--   drop function if exists public.osm_place_area_add(double precision, double precision, double precision, text[], text);
--   drop function if exists public.osm_places_named(text, integer);
--   drop function if exists public.osm_places_near(double precision, double precision, double precision, text[], integer);
--   drop table if exists public.osm_place_areas;
--   drop table if exists public.osm_places;

create extension if not exists postgis with schema extensions;

-- One row per OSM element; its categories are the keys of src/lib/geo/categories.ts (`other` for a geocoded place
-- of none of them). A repeated load updates the row.
create table if not exists public.osm_places (
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint not null,
  name text,
  categories text[] not null check (cardinality(categories) > 0),
  tags jsonb not null default '{}'::jsonb,
  -- The centre: the marker on the map and the end of a route.
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  -- The shape the distances are measured to: a point, the line of the coast, the polygon of a beach or a park.
  geom extensions.geography not null,
  -- How the row came last: `preload` by the script, `online` by the server for a question the cache did not cover.
  origin text not null check (origin in ('preload', 'online')),
  fetched_at timestamptz not null default now(),
  attribution text not null default '© OpenStreetMap contributors, ODbL 1.0',
  primary key (osm_type, osm_id)
);

create index if not exists osm_places_geom_idx on public.osm_places using gist (geom);
create index if not exists osm_places_categories_idx on public.osm_places using gin (categories);

-- The areas loaded with their categories: what makes «nothing near» different from «not loaded yet».
create table if not exists public.osm_place_areas (
  id bigint generated always as identity primary key,
  categories text[] not null check (cardinality(categories) > 0),
  area extensions.geometry(Polygon, 4326) not null,
  origin text not null check (origin in ('preload', 'online')),
  loaded_at timestamptz not null default now()
);

create index if not exists osm_place_areas_area_idx on public.osm_place_areas using gist (area);

-- No policies: the service role (it bypasses RLS) writes, everyone else reads through `osm_places_near`.
alter table public.osm_places enable row level security;
alter table public.osm_place_areas enable row level security;
revoke all on public.osm_places, public.osm_place_areas from anon, authenticated;

-- The nearest places of each wanted category within `radius_m` (at most 50 km) of the point, `per_category` of each
-- (at most 20), nearest first, and the wanted categories the loaded areas cover for the whole circle. The distance is
-- to the shape; `near_lat`/`near_lon` is its point nearest to the given one.
create or replace function public.osm_places_near(
  lat double precision,
  lon double precision,
  radius_m double precision,
  wanted text[],
  per_category integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography as g,
      least(greatest(radius_m, 1), 50000) as r,
      least(greatest(per_category, 1), 20) as k
  ),
  circle as (select extensions.st_buffer(p.g, p.r)::extensions.geometry as c from p),
  covered as (
    select distinct w.cat
    from unnest(wanted) w(cat), public.osm_place_areas a, circle
    where a.categories @> array[w.cat] and extensions.st_covers(a.area, circle.c)
  ),
  hits as (
    select w.cat, x.*
    from unnest(wanted) w(cat), p
    cross join lateral (
      select o.osm_type, o.osm_id, o.name, o.categories, o.tags, o.lat, o.lon, o.origin, o.fetched_at, o.attribution,
        extensions.st_distance(o.geom, p.g) as distance_m,
        extensions.st_closestpoint(o.geom::extensions.geometry, p.g::extensions.geometry) as near
      from public.osm_places o
      where o.categories @> array[w.cat] and extensions.st_dwithin(o.geom, p.g, p.r)
      order by extensions.st_distance(o.geom, p.g), o.osm_type, o.osm_id
      limit p.k
    ) x
  )
  select jsonb_build_object(
    'covered', coalesce((select jsonb_agg(covered.cat order by covered.cat) from covered), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', h.cat, 'osm_type', h.osm_type, 'osm_id', h.osm_id, 'name', h.name, 'categories', h.categories,
        'tags', h.tags, 'lat', h.lat, 'lon', h.lon, 'distance_m', round(h.distance_m::numeric, 1),
        'near_lat', extensions.st_y(h.near), 'near_lon', extensions.st_x(h.near),
        'origin', h.origin, 'fetched_at', h.fetched_at, 'attribution', h.attribution
      ) order by h.cat, h.distance_m)
      from hits h
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.osm_places_near(double precision, double precision, double precision, text[], integer) from public;
grant execute on function public.osm_places_near(double precision, double precision, double precision, text[], integer)
  to anon, authenticated, service_role;

-- The places named `q` exactly, any case, in the local name or its Russian, Spanish, Valencian or English one: the
-- geocoding asks the cache before Nominatim.
create or replace function public.osm_places_named(q text, max_places integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'osm_type', o.osm_type, 'osm_id', o.osm_id, 'name', o.name, 'categories', o.categories, 'tags', o.tags,
    'lat', o.lat, 'lon', o.lon, 'origin', o.origin, 'attribution', o.attribution
  )), '[]'::jsonb)
  from (
    select o.*
    from public.osm_places o
    where lower(q) in (
      lower(o.name), lower(o.tags ->> 'name:ru'), lower(o.tags ->> 'name:es'), lower(o.tags ->> 'name:ca'),
      lower(o.tags ->> 'name:en')
    )
    order by o.osm_type, o.osm_id
    limit least(greatest(max_places, 1), 20)
  ) o;
$$;

revoke execute on function public.osm_places_named(text, integer) from public;
grant execute on function public.osm_places_named(text, integer) to anon, authenticated, service_role;

-- Records the circle the server has just asked Overpass about, built the way `osm_places_near` builds its circle, so
-- the same question is covered next time. The script records its rectangle with an insert.
create or replace function public.osm_place_area_add(
  lat double precision,
  lon double precision,
  radius_m double precision,
  categories text[],
  origin text default 'online'
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.osm_place_areas (categories, area, origin)
  values (
    categories,
    extensions.st_buffer(
      extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography,
      least(greatest(radius_m, 1), 50000)
    )::extensions.geometry,
    origin
  );
$$;

revoke execute on function public.osm_place_area_add(double precision, double precision, double precision, text[], text) from public, anon, authenticated;
grant execute on function public.osm_place_area_add(double precision, double precision, double precision, text[], text) to service_role;
