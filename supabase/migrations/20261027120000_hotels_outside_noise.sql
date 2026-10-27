-- The real hotels outside the loaded EEA noise maps: no contour of `public.geo_noise` covers the hotel's point, the
-- same test as `hotel_geo().noise` and so as the page's «Нет данных EEA». The noise is loaded for the city of
-- Valencia only (its buildings' extent plus 300 m, `scripts/load-valencia-geo.py`), so this is the hotels at the
-- airport of Manises, in Paterna, Quart de Poblet, Alaquàs and Alfafar. The catalogue hides them everywhere
-- (`src/lib/db/catalog.ts`); the rows stay. With no noise loaded at all no hotel is listed, so an empty table never
-- hides the whole catalogue. Loading the noise for more of the area brings the hotels back without a migration.
create or replace function public.hotels_outside_noise()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select h.id
  from public.hotels h
  where h.id like 'ota-%'
    and exists (select 1 from public.geo_noise)
    and not exists (
      select 1 from public.geo_noise n
      where extensions.st_intersects(n.geom, extensions.st_setsrid(extensions.st_makepoint(h.lon, h.lat), 4326))
    )
  order by h.id;
$$;

revoke execute on function public.hotels_outside_noise() from public;
grant execute on function public.hotels_outside_noise() to anon, authenticated, service_role;
