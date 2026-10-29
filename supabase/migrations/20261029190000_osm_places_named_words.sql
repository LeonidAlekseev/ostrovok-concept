-- «ТЦ Aqua» (ota-7481548: the route to the mall) found nothing: the cache has the place as «Aqua Multiespacio», and
-- the trigram similarity of «aqua» to it is far below 0.65. `osm_places_named` now also takes a place whose name has
-- every word of the query as a whole word (the generic «ТЦ», «торговый центр», «centro comercial», «hotel», «cafe» do not count), scored
-- 0.7–0.95 by the share of the name the query is: «Aqua Multiespacio» (0.825) before «Hotel Ilunion Aqua 4» (0.76).
-- A query that says «ТЦ» or «mall» puts the places tagged `shop=mall` first (+0.1): «ТЦ Aqua» is the mall, not «Farmacia Aqua».
-- A query of fewer than four letters of words is left to the trigrams. Equal names still win over both.
--
-- Idempotent. Rollback: re-run `osm_places_named` of 20261028210000_osm_places_fuzzy_name.sql.

create or replace function public.osm_places_named(q text, max_places integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with key as (
    select public.place_name_key(q) as k,
      array(
        select w from unnest(string_to_array(public.place_name_key(q), ' ')) w
        where w <> '' and w <> all (array['тц', 'трц', 'торговый', 'торговая', 'центр', 'моль', 'mall', 'centro', 'comercial', 'cc',
          'hotel', 'отель', 'hostal', 'hostel', 'restaurante', 'restaurant', 'ресторан', 'cafe', 'кафе', 'bar', 'бар'])
      ) as words,
      public.place_name_key(q) ~ '(^| )(тц|трц|торговый|торговая|моль|mall|comercial)( |$)' as mall
  ),
  scored as (
    select o.*,
      (select max(greatest(
         extensions.similarity(public.place_name_key(n), key.k),
         case
           when length(array_to_string(key.words, '')) >= 4
             and key.words <@ string_to_array(public.place_name_key(n), ' ')
           then 0.7 + 0.25 * cardinality(key.words)::float / cardinality(string_to_array(public.place_name_key(n), ' '))
             + case when key.mall and o.tags ->> 'shop' = 'mall' then 0.1 else 0 end
           else 0
         end))
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
