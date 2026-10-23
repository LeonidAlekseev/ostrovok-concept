-- The raw Ostrovok data behind the real hotels of the catalogue (`ota-<master_id>` in public.hotels), written by
-- `npm run db:seed:valencia -- <search.json>`. The detailed data of each hotel, when it comes, joins by `master_id`.
-- Idempotent: safe to re-run on a database that already has these objects.

-- One row per hotel of the searches: the objects of the search as they are.
create table if not exists public.ota_hotels (
  master_id bigint primary key,
  ota_hotel_id text not null unique,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  -- `hotels[].static_vm`, `hotels[].rates` and `hotels[].marketing_badges`, and the hotel's `map_hotels[]` pin.
  static_vm jsonb not null,
  rates jsonb not null default '[]'::jsonb,
  marketing_badges jsonb,
  map_hotel jsonb,
  updated_at timestamptz not null default now()
);

-- One row per search: everything but its hotels (`available_filter_params`, `total_*`, `search_finished`).
create table if not exists public.ota_searches (
  id text primary key,
  region_slug text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Everyone reads them, as the catalogue; only the service role (which bypasses RLS) writes them.
alter table public.ota_hotels enable row level security;
alter table public.ota_searches enable row level security;

drop policy if exists "ota_hotels_select_all" on public.ota_hotels;
create policy "ota_hotels_select_all" on public.ota_hotels for select to anon, authenticated using (true);

drop policy if exists "ota_searches_select_all" on public.ota_searches;
create policy "ota_searches_select_all" on public.ota_searches for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.ota_hotels, public.ota_searches from anon, authenticated;
