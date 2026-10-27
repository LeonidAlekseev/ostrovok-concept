-- The quiet of the noise map around a hotel: where the EEA END 2022 layers map the ground and none of them reaches
-- 40 dB, per indicator: `select public.hotel_noise_quiet(39.4699, -0.3763, 300)`. Every layer of `public.geo_noise` has
-- a «below 40 dB» band around all it maps, so the bands of one layer cover the louder bands of the others; the map
-- draws this instead: the union of the bands below 40 dB minus the union of the bands from 40 dB of every layer, cut
-- to the circle. What no layer maps (the holes of the contours) stays out. Same circle and limits as
-- `hotel_geo_features` (1–500 m, 300 by default); outside the maps or with coordinates out of range: no features.
-- Idempotent.
--
-- Rollback: `drop function if exists public.hotel_noise_quiet(double precision, double precision, double precision);`
create or replace function public.hotel_noise_quiet(
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
  n as (
    select n.indicator, n.db_min is null as quiet,
           extensions.st_union(
             extensions.st_collectionextract(extensions.st_intersection(n.geom, c.circle), 3)
           ) as geom
    from public.geo_noise n, c
    where extensions.st_intersects(n.geom, c.circle)
    group by n.indicator, n.db_min is null
  ),
  q as (
    select q.indicator,
           extensions.st_collectionextract(
             case when l.geom is null then q.geom else extensions.st_difference(q.geom, l.geom) end, 3
           ) as geom
    from n q
    left join n l on l.indicator = q.indicator and not l.quiet
    where q.quiet
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.st_asgeojson(q.geom, 6)::jsonb,
        'properties', jsonb_build_object(
          'layer', 'noise', 'source', 'quiet', 'indicator', q.indicator, 'db_min', null, 'db_max', 39
        )
      ) order by q.indicator)
      from q
      where not extensions.st_isempty(q.geom)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.hotel_noise_quiet(double precision, double precision, double precision) from public;
grant execute on function public.hotel_noise_quiet(double precision, double precision, double precision)
  to anon, authenticated, service_role;
