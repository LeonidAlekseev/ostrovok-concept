-- The pieces of the day layer of the noise map around a hotel: `select public.hotel_noise_day(39.4699, -0.3763, 300)`.
-- EEA END 2022 gives Lden and Lnight only; the day level is estimated from the two (`dayEstimate` of src/lib/noise.ts,
-- the formula of the directive 2002/49/EC), so the map needs the places where one Lden band and one Lnight band of the
-- same layer meet: each band from 40 dB of Lden of a layer of `public.geo_noise`, cut to the circle, intersected with
-- each band of Lnight of the same layer, the «below 40 dB» one included. Every piece keeps its two bands; the estimate
-- is the app's. Lden below 40 dB is the quiet of `hotel_noise_quiet`, so it is left out; slivers under 1 m² of the
-- bands' borders as well. Same circle and limits as `hotel_geo_features` (1–500 m, 300 by default); outside the maps
-- or with coordinates out of range: no features. Idempotent.
--
-- Rollback: `drop function if exists public.hotel_noise_day(double precision, double precision, double precision);`
create or replace function public.hotel_noise_day(
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
    select extensions.st_buffer(p.g::extensions.geography, p.r, 16)::extensions.geometry as circle
    from p
  ),
  -- The contours cut to the circle one by one: a union of each band first is slower.
  b as (
    select n.source, n.indicator, n.db_min, n.db_max,
           extensions.st_collectionextract(extensions.st_intersection(n.geom, c.circle), 3) as geom
    from public.geo_noise n, c
    where extensions.st_intersects(n.geom, c.circle)
      and (n.indicator = 'Lnight' or (n.indicator = 'Lden' and n.db_min is not null))
  ),
  x as (
    select d.source, d.db_min as lden_min, d.db_max as lden_max, n.db_min as lnight_min, n.db_max as lnight_max,
           extensions.st_union(
             extensions.st_collectionextract(extensions.st_intersection(d.geom, n.geom), 3)
           ) as geom
    from b d
    join b n on n.source = d.source and n.indicator = 'Lnight' and extensions.st_intersects(d.geom, n.geom)
    where d.indicator = 'Lden'
    group by d.source, d.db_min, d.db_max, n.db_min, n.db_max
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.st_asgeojson(x.geom, 6)::jsonb,
        'properties', jsonb_build_object(
          'layer', 'noise', 'source', x.source,
          'lden_min', x.lden_min, 'lden_max', x.lden_max, 'lnight_min', x.lnight_min, 'lnight_max', x.lnight_max
        )
      ) order by x.source, x.lden_min, x.lnight_min nulls first)
      from x
      -- m² near the point: a degree of latitude is 111.32 km.
      where not extensions.st_isempty(x.geom)
        and extensions.st_area(x.geom) * 111320 * 111320 * cos(radians(lat)) >= 1
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.hotel_noise_day(double precision, double precision, double precision) from public;
grant execute on function public.hotel_noise_day(double precision, double precision, double precision)
  to anon, authenticated, service_role;
