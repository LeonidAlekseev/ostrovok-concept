-- The noise at the hotel's facade (noise-facade-estimate, method `noise-estimate-v1`). EEA's strategic noise maps leave
-- the buildings out: the point of a hotel inside its building lies in no contour of the roads, and `hotel_geo` reads
-- the bands of what does cover it (often only industry «below 40 dB»), while the street at the door is 70 dB. The
-- facade is read instead: the contour of the hotel's building of EUBUCCO (the one `hotel_geo` takes: containing the
-- point, else the nearest within 50 m) widened by 5 m, or a circle of 25 m around the point without a building.
--
-- * `hotel_noise_facade(lat, lon)` (anon): `{zone, bands}` — the zone (`kind` `building` with `building_id` and
--   `buffer_m`, or `circle` with `radius_m`) and, per EEA layer and indicator, the loudest band crossing the zone
--   (`side` `street`: the facade to the street) and the quietest (`side` `yard`: the windows to the yard). The app adds
--   the loud places of OSM and sums the levels (src/lib/noise.ts, `noiseEstimate`).
-- * `hotel_features` gets the estimate at the facade: the day and night levels of the street side and of the yard side
--   with the places (`real`, dB; a null bound is an open end), the zone, the method. `lden_*` and `lnight_*` keep their
--   shape and now hold the loudest EEA band at the facade, not at the point. Filled by `npm run db:features`.
--
-- Idempotent. Rollback: `drop function if exists public.hotel_noise_facade(double precision, double precision);
-- alter table public.hotel_features drop column if exists noise_method, drop column if exists noise_zone,
-- drop column if exists street_lday_min, drop column if exists street_lday_max, drop column if exists street_lnight_min,
-- drop column if exists street_lnight_max, drop column if exists yard_lday_min, drop column if exists yard_lday_max,
-- drop column if exists yard_lnight_min, drop column if exists yard_lnight_max;` (then `npm run db:features` on the
-- old code writes the bands at the point again).

create or replace function public.hotel_noise_facade(lat double precision, lon double precision)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) as g
    where lat between -90 and 90 and lon between -180 and 180
  ),
  -- The nearest building by the index, kept within 50 m (as `hotel_geo`): a filter on the geography first would not
  -- use the index and reads every building.
  nearest as (
    select b.id, b.geom
    from public.geo_buildings b, p
    order by b.geom operator(extensions.<->) p.g
    limit 1
  ),
  b as (
    select nearest.* from nearest, p
    where extensions.st_dwithin(nearest.geom::extensions.geography, p.g::extensions.geography, 50)
  ),
  z as (
    select
      coalesce(
        (select extensions.st_buffer(b.geom::extensions.geography, 5)::extensions.geometry from b),
        extensions.st_buffer(p.g::extensions.geography, 25)::extensions.geometry
      ) as zone,
      (select b.id from b) as building_id
    from p
  ),
  n as (
    select n.source, n.indicator, n.db_min, n.db_max, n.dataset
    from public.geo_noise n, z
    where extensions.st_intersects(n.geom, z.zone)
  ),
  street as (
    select distinct on (n.source, n.indicator) 'street' as side, n.*
    from n
    order by n.source, n.indicator, n.db_min desc nulls last, n.db_max desc nulls first
  ),
  yard as (
    select distinct on (n.source, n.indicator) 'yard' as side, n.*
    from n
    order by n.source, n.indicator, n.db_min asc nulls first, n.db_max asc nulls last
  ),
  bands as (select * from street union all select * from yard)
  select jsonb_build_object(
    'zone', case
      when z.building_id is not null then jsonb_build_object('kind', 'building', 'building_id', z.building_id, 'buffer_m', 5)
      else jsonb_build_object('kind', 'circle', 'radius_m', 25)
    end,
    'bands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'side', x.side, 'source', x.source, 'indicator', x.indicator, 'db_min', x.db_min, 'db_max', x.db_max,
        'dataset', x.dataset
      ) order by x.side, x.source, x.indicator)
      from bands x
    ), '[]'::jsonb)
  )
  from z;
$$;

revoke execute on function public.hotel_noise_facade(double precision, double precision) from public;
grant execute on function public.hotel_noise_facade(double precision, double precision)
  to anon, authenticated, service_role;

alter table public.hotel_features
  add column if not exists noise_method text,
  add column if not exists noise_zone text check (noise_zone in ('building', 'circle')),
  add column if not exists street_lday_min real,
  add column if not exists street_lday_max real,
  add column if not exists street_lnight_min real,
  add column if not exists street_lnight_max real,
  add column if not exists yard_lday_min real,
  add column if not exists yard_lday_max real,
  add column if not exists yard_lnight_min real,
  add column if not exists yard_lnight_max real;

comment on column public.hotel_features.lden_min is
  'The loudest EEA Lden band at the facade (hotel_noise_facade, side street) over all the layers; null: open end';
comment on column public.hotel_features.street_lday_min is
  'noise-estimate-v1: Lday at the street facade, EEA layers and the loud OSM places summed, dB; null: open end';
comment on column public.hotel_features.yard_lnight_min is
  'noise-estimate-v1: Lnight at the yard side (the quietest EEA bands) with the loud OSM places, dB; null: open end';
