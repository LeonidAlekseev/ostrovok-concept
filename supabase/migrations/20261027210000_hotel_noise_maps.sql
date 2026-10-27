-- The noise maps of the hotels computed ahead (refactor-cleanup). The map of «Шум и окружение» needs three functions
-- around the hotel's point: the Lnight contours of `hotel_geo_features`, the quiet of `hotel_noise_quiet` and the day
-- pieces of `hotel_noise_day`. They intersect the EEA polygons in the circle on every request: 0.45 s for the day alone
-- (median of the 221 real hotels, up to 1.3 s), and with 8 maps at once up to 5.8 s, over the anon role's 3 s limit.
-- The noise changes only when `scripts/load-valencia-geo.py noise` reloads it, so the maps are computed once:
--
-- * `public.hotel_noise_maps`: the three parts of the map per point and radius — a point, not a hotel, because the
--   functions take a point and two hotels of one building share it. `contours` keeps only what the map draws of
--   `hotel_geo_features`: the Lnight bands from 40 dB (no buildings, no Lden, no bands below 40 dB). Closed to anon and
--   authenticated: read through the function below.
-- * `hotel_noise_map(lat, lon, radius_m)` (anon): `{contours, quiet, day}`, each a list of GeoJSON features as the
--   functions give them, or `null` when the point has no map yet (a new hotel, or one that moved): the app then asks
--   the three functions as before.
-- * `hotel_noise_map_refresh(lat, lon, radius_m)` (service role): computes and stores one point; returns the features
--   stored. `npm run db:features` calls it for every real hotel, then `hotel_noise_maps_prune`.
-- * `hotel_noise_maps_prune(radius_m)` (service role): deletes the maps of points where no real hotel stands.
--
-- Same circle and limits as the three functions (1–500 m, 300 by default). Idempotent.
--
-- Rollback: `drop function if exists public.hotel_noise_maps_prune(double precision);
-- drop function if exists public.hotel_noise_map_refresh(double precision, double precision, double precision);
-- drop function if exists public.hotel_noise_map(double precision, double precision, double precision);
-- drop table if exists public.hotel_noise_maps;`
create table if not exists public.hotel_noise_maps (
  lat double precision not null,
  lon double precision not null,
  radius_m double precision not null,
  contours jsonb not null,
  quiet jsonb not null,
  day jsonb not null,
  computed_at timestamptz not null default now(),
  constraint hotel_noise_maps_pkey primary key (lat, lon, radius_m)
);

alter table public.hotel_noise_maps enable row level security;
revoke all on table public.hotel_noise_maps from anon, authenticated;

create or replace function public.hotel_noise_map(
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
  -- In a SQL function a column wins over a parameter of the same name: the parameters are qualified.
  select jsonb_build_object('contours', m.contours, 'quiet', m.quiet, 'day', m.day)
  from public.hotel_noise_maps m
  where m.lat = hotel_noise_map.lat
    and m.lon = hotel_noise_map.lon
    and m.radius_m = least(greatest(coalesce(hotel_noise_map.radius_m, 300), 1), 500);
$$;

create or replace function public.hotel_noise_map_refresh(
  lat double precision,
  lon double precision,
  radius_m double precision default 300
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r constant double precision := least(greatest(coalesce(radius_m, 300), 1), 500);
  night jsonb;
  quiet jsonb;
  day jsonb;
begin
  -- The Lnight bands from 40 dB, in the order the function gives them (what `nightOf` of src/lib/db/noise.ts takes).
  select coalesce(jsonb_agg(f.feature order by f.n), '[]'::jsonb) into night
  from jsonb_array_elements(public.hotel_geo_features(lat, lon, r) -> 'features') with ordinality as f(feature, n)
  where f.feature #>> '{properties,layer}' = 'noise'
    and f.feature #>> '{properties,indicator}' = 'Lnight'
    and jsonb_typeof(f.feature #> '{properties,db_min}') = 'number';
  quiet := coalesce(public.hotel_noise_quiet(lat, lon, r) -> 'features', '[]'::jsonb);
  day := coalesce(public.hotel_noise_day(lat, lon, r) -> 'features', '[]'::jsonb);

  insert into public.hotel_noise_maps as m (lat, lon, radius_m, contours, quiet, day, computed_at)
  values (lat, lon, r, night, quiet, day, now())
  on conflict on constraint hotel_noise_maps_pkey do update
    set contours = excluded.contours, quiet = excluded.quiet, day = excluded.day, computed_at = excluded.computed_at;

  return jsonb_array_length(night) + jsonb_array_length(quiet) + jsonb_array_length(day);
end;
$$;

create or replace function public.hotel_noise_maps_prune(radius_m double precision default 300)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.hotel_noise_maps m
    where m.radius_m = least(greatest(coalesce(hotel_noise_maps_prune.radius_m, 300), 1), 500)
      and not exists (
        select 1 from public.hotels h where h.id like 'ota-%' and h.lat = m.lat and h.lon = m.lon
      )
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.hotel_noise_map(double precision, double precision, double precision) from public;
grant execute on function public.hotel_noise_map(double precision, double precision, double precision)
  to anon, authenticated, service_role;

revoke execute on function public.hotel_noise_map_refresh(double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.hotel_noise_map_refresh(double precision, double precision, double precision)
  to service_role;

revoke execute on function public.hotel_noise_maps_prune(double precision) from public, anon, authenticated;
grant execute on function public.hotel_noise_maps_prune(double precision) to service_role;
