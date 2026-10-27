-- The distance of each hotel to the sea for Эвал's «близко к морю»: from the hotel's point to the nearest coastline of
-- OpenStreetMap (`natural=coastline`, the category `sea` of `public.osm_places`), whole metres:
-- `select * from public.hotel_sea_distances()`. A distance is given only where it is known: the coastline is within
-- 10 km and the circle up to it lies in an area loaded with the category `sea` (`public.osm_place_areas`), so a coast
-- missing from the cache never reads as «далеко». Nothing is stored: the values follow the cache. Idempotent.
--
-- Rollback: `drop function if exists public.hotel_sea_distances();`
create or replace function public.hotel_sea_distances()
returns table (hotel_id text, sea_m integer)
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select h.id, extensions.st_setsrid(extensions.st_makepoint(h.lon, h.lat), 4326)::extensions.geography as g
    from public.hotels h
    where exists (
      select 1 from public.osm_place_areas a
      where a.categories @> array['sea']
        and extensions.st_intersects(a.area, extensions.st_setsrid(extensions.st_makepoint(h.lon, h.lat), 4326))
    )
  ),
  d as (
    select h.id, h.g, (
      select min(extensions.st_distance(h.g, p.geom))
      from public.osm_places p
      where p.categories @> array['sea'] and extensions.st_dwithin(h.g, p.geom, 10000)
    ) as m
    from h
  )
  select d.id, round(d.m)::integer
  from d
  where d.m is not null
    and exists (
      select 1 from public.osm_place_areas a
      where a.categories @> array['sea']
        and extensions.st_covers(a.area, extensions.st_buffer(d.g, greatest(d.m, 1), 16)::extensions.geometry)
    )
  order by d.id;
$$;

revoke execute on function public.hotel_sea_distances() from public;
grant execute on function public.hotel_sea_distances() to anon, authenticated, service_role;
