-- Fuzzy search of places by name: «Mercado Central» finds «Mercat Central». Accents and case do not matter, and
-- when no name is equal, the nearest by trigrams (pg_trgm) is taken. The cache holds a few thousand places, so a scan
-- of it is cheap and no index is made.
--
-- Rollback:
--   drop function if exists public.osm_places_named(text, integer);
--   drop function if exists public.place_name_key(text);
--   (and the 20261026130000 version of osm_places_named back)

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- The name as it is compared: without accents and case, only letters and digits split by one space.
create or replace function public.place_name_key(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(name, ''))),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

-- The places named `q`: those with an equal name (local, Russian, Spanish, Valencian or English) if there are, else
-- those whose name is at least 0.65 similar by trigrams, the most similar first. The geocoding asks the cache before Nominatim.
create or replace function public.osm_places_named(q text, max_places integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with key as (select public.place_name_key(q) as k),
  scored as (
    select o.*,
      (select max(extensions.similarity(public.place_name_key(n), key.k))
       from unnest(array[o.name, o.tags ->> 'name:ru', o.tags ->> 'name:es', o.tags ->> 'name:ca', o.tags ->> 'name:en']) n
       where n is not null) as score
    from public.osm_places o, key
    where key.k <> ''
  ),
  best as (
    select s.*, s.score >= 0.999 as exact
    from scored s
    where s.score >= 0.65
  ),
  chosen as (
    select b.* from best b
    where b.exact or not exists (select 1 from best e where e.exact)
    order by b.score desc, b.osm_type, b.osm_id
    limit least(greatest(max_places, 1), 20)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'osm_type', c.osm_type, 'osm_id', c.osm_id, 'name', c.name, 'categories', c.categories, 'tags', c.tags,
    'lat', c.lat, 'lon', c.lon, 'origin', c.origin, 'attribution', c.attribution
  ) order by c.score desc, c.osm_type, c.osm_id), '[]'::jsonb)
  from chosen c;
$$;

revoke execute on function public.osm_places_named(text, integer) from public;
grant execute on function public.osm_places_named(text, integer) to anon, authenticated, service_role;
revoke execute on function public.place_name_key(text) from public;
grant execute on function public.place_name_key(text) to anon, authenticated, service_role;
