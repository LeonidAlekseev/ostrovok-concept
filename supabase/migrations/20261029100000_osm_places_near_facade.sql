-- The loud places of OSM around the hotel's facade (noise-view-accuracy, method `noise-estimate-v2`). `osm_places_near`
-- measures from the hotel's point, which lies inside its building: a bar across a 20 m street is then 30 m away, not
-- 15, and the venues' level at the wall is understated. `osm_places_near_facade` measures from the hotel's building of
-- EUBUCCO (the one `hotel_noise_facade` takes: the nearest to the point within 50 m) and from the point when there is
-- none. The answer has the shape of `osm_places_near`; `distance_m` is to the building's wall (0 for a place inside
-- it), `near_lat`/`near_lon` is the place's point nearest to the building.
--
-- Idempotent. Rollback: `drop function if exists public.osm_places_near_facade(double precision, double precision,
-- double precision, text[], integer);` (the app and `npm run db:features` on the old code call `osm_places_near`).

create or replace function public.osm_places_near_facade(
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
    select extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) as g,
      least(greatest(radius_m, 1), 50000) as r,
      least(greatest(per_category, 1), 20) as k
    where lat between -90 and 90 and lon between -180 and 180
  ),
  -- The nearest building by the index, kept within 50 m, as `hotel_noise_facade`.
  nearest as (
    select b.geom from public.geo_buildings b, p order by b.geom operator(extensions.<->) p.g limit 1
  ),
  b as (
    select nearest.geom from nearest, p
    where extensions.st_dwithin(nearest.geom::extensions.geography, p.g::extensions.geography, 50)
  ),
  o as (
    select coalesce((select b.geom from b), p.g)::extensions.geography as g, p.r, p.k from p
  ),
  circle as (select extensions.st_buffer(o.g, o.r)::extensions.geometry as c from o),
  covered as (
    select distinct w.cat
    from unnest(wanted) w(cat), public.osm_place_areas a, circle
    where a.categories @> array[w.cat] and extensions.st_covers(a.area, circle.c)
  ),
  hits as (
    select w.cat, x.*
    from unnest(wanted) w(cat), o
    cross join lateral (
      select pl.osm_type, pl.osm_id, pl.name, pl.categories, pl.tags, pl.lat, pl.lon, pl.origin, pl.fetched_at,
        pl.attribution,
        extensions.st_distance(pl.geom, o.g) as distance_m,
        extensions.st_closestpoint(pl.geom::extensions.geometry, o.g::extensions.geometry) as near
      from public.osm_places pl
      where pl.categories @> array[w.cat] and extensions.st_dwithin(pl.geom, o.g, o.r)
      order by extensions.st_distance(pl.geom, o.g), pl.osm_type, pl.osm_id
      limit o.k
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

revoke execute on function public.osm_places_near_facade(double precision, double precision, double precision, text[], integer) from public;
grant execute on function public.osm_places_near_facade(double precision, double precision, double precision, text[], integer)
  to anon, authenticated, service_role;
