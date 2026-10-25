-- What Эвал picks by beyond the catalogue: the building's height and floors and the noise at the hotel (from
-- `hotel_geo`, #166) and the window views of its room types (from the names of the Ostrovok room groups).
-- Only the derived values and a reference to their source live here: the raw `ota_hotels` and the geodata are not
-- copied. Filled by `npm run db:features` (scripts/hotel-features.ts), which is idempotent; only Valencia has data.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback: `drop view if exists public.hotel_room_views_named; drop table if exists public.hotel_room_views,
-- public.hotel_features;` — nothing else reads them, the hotels' vectors lose the lines on the next `db:embed`.

-- One row per hotel with any data: the building at its point and the loudest noise band there.
create table if not exists public.hotel_features (
  hotel_id text primary key references public.hotels (id) on delete cascade,
  -- `geo_buildings.id` of the building `hotel_geo` found (containing the point or within 50 m).
  building_id text,
  -- Metres above ground and the floor count as the dataset estimates them, the floors rounded.
  height_m real check (height_m > 0),
  floors smallint check (floors > 0),
  -- The loudest 5 dB band at the point over all the sources (`geo_noise`); a null bound is an open end
  -- (`LnightLowerThan40` is null–39). The source is the band's: roadsInAgglomeration, railwaysInAgglomeration, …
  lden_min smallint,
  lden_max smallint,
  lden_source text,
  lnight_min smallint,
  lnight_max smallint,
  lnight_source text,
  updated_at timestamptz not null default now(),
  check (building_id is not null or (height_m is null and floors is null)),
  check (lden_min is not null or lden_max is not null or lden_source is null),
  check (lnight_min is not null or lnight_max is not null or lnight_source is null)
);

-- A room type with a view: the view belongs to the room, not to the hotel. The room is the Ostrovok room group
-- (`ota_hotels.static_vm -> room_groups[]`, its `rg_hash`; the catalogue's room `room-<rg_hash>`), so the row
-- points at the hotel's raw data and never copies the room's name.
create table if not exists public.hotel_room_views (
  hotel_id text not null references public.hotels (id) on delete cascade,
  master_id bigint not null references public.ota_hotels (master_id) on delete cascade,
  rg_hash text not null,
  -- `nice` is «с красивым видом из окна» without saying of what.
  view text not null check (view in ('sea', 'water', 'city', 'garden', 'park', 'courtyard', 'pool', 'mountain', 'street', 'nice')),
  -- Where the view was read: the room's name only, for now; it is «по описанию», never checked.
  source text not null default 'room_name' check (source in ('room_name')),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, rg_hash, view),
  check (hotel_id = 'ota-' || master_id)
);

create index if not exists hotel_room_views_master_id_idx on public.hotel_room_views (master_id);

-- The rows with the room's name, read from the raw room group at query time.
create or replace view public.hotel_room_views_named
with (security_invoker = true)
as
select v.hotel_id, v.rg_hash, v.view, v.source, g -> 'name_struct' ->> 'main_name' as room_name
from public.hotel_room_views v
join public.ota_hotels o on o.master_id = v.master_id
cross join lateral jsonb_array_elements(o.static_vm -> 'room_groups') g
where g ->> 'rg_hash' = v.rg_hash;

-- Everyone reads them, as the catalogue; only the service role (which bypasses RLS) writes them.
alter table public.hotel_features enable row level security;
alter table public.hotel_room_views enable row level security;

drop policy if exists "hotel_features_select_all" on public.hotel_features;
create policy "hotel_features_select_all" on public.hotel_features for select to anon, authenticated using (true);

drop policy if exists "hotel_room_views_select_all" on public.hotel_room_views;
create policy "hotel_room_views_select_all" on public.hotel_room_views
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.hotel_features, public.hotel_room_views from anon, authenticated;
revoke all on public.hotel_room_views_named from anon, authenticated;
grant select on public.hotel_room_views_named to anon, authenticated;
