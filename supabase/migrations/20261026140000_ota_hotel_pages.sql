-- The licensed snapshots of the Ostrovok pages of the real hotels (`/home/agent/hotels-data/<master_id>.json`), written
-- by `npm run db:load:ota-pages -- <dir>`: the page's hotel and reviews by `master_id`, its places of interest once
-- each with a point, the hotel's distance to each of them, and the rate tag translations, the same on every page.
-- Without the contacts, the analytics, the settings and the CSP of the page. Idempotent: safe to re-run.
--
-- Rollback: `drop view if exists public.ota_hotel_places; drop table if exists public.ota_hotel_pois,
-- public.ota_pois, public.ota_hotel_pages, public.ota_rate_spec_tags;` and `npm run db:rebuild:ota` writes the
-- hotels back without the page's data.

-- One row per hotel page: `props.pageProps.hotel` without `contacts`, `location.pois` (they are `ota_hotel_pois`)
-- and the images' `relativePath` (the path of `tmpl` again), and `props.pageProps.reviews` as it is.
create table if not exists public.ota_hotel_pages (
  master_id bigint primary key references public.ota_hotels (master_id) on delete cascade,
  hotel jsonb not null check (jsonb_typeof(hotel) = 'object' and not hotel ? 'contacts'),
  reviews jsonb not null default '{}'::jsonb check (jsonb_typeof(reviews) = 'object'),
  updated_at timestamptz not null default now(),
  check ((hotel ->> 'masterId')::bigint = master_id)
);

-- A place of interest of Ostrovok (`props.pageProps.pois[]`): a sight, a station, the airport. Its Ostrovok region
-- is its id; the point is its `center`.
create table if not exists public.ota_pois (
  region_id bigint primary key,
  -- `POI`, `SUBWAY` or `AIRPORT`.
  type text not null,
  -- `MUSEUM`, `PARK`, `HISTORICAL_POI`, …; `UNSPECIFIED` for the stations and the airport.
  subtype text not null,
  name text not null,
  name_en text not null,
  -- `inflection.genitive`, «у Национального музея керамики» is `inflection.locativeIn`.
  genitive text,
  locative_in text,
  catalog_slug text,
  geom extensions.geometry(Point, 4326) not null check (extensions.st_isvalid(geom) and not extensions.st_isempty(geom)),
  updated_at timestamptz not null default now(),
  check (name <> '' or name_en <> '')
);

create index if not exists ota_pois_geom_idx on public.ota_pois using gist (geom);

-- A place of the hotel's page (`hotel.location.pois[]`): Ostrovok's distance to it and its marks.
create table if not exists public.ota_hotel_pois (
  master_id bigint not null references public.ota_hotels (master_id) on delete cascade,
  region_id bigint not null references public.ota_pois (region_id) on delete cascade,
  -- Metres, as Ostrovok gives them.
  distance_m int not null check (distance_m >= 0),
  is_nearby boolean not null,
  is_top_poi boolean not null,
  is_transport_hub boolean not null,
  updated_at timestamptz not null default now(),
  primary key (master_id, region_id)
);

create index if not exists ota_hotel_pois_region_id_idx on public.ota_hotel_pois (region_id);

-- `props.pageProps.rateSpecTagTranslations[]`: one list, the same on every page.
create table if not exists public.ota_rate_spec_tags (
  name text primary key,
  translation text not null,
  priority int not null,
  adj_kind text not null,
  updated_at timestamptz not null default now()
);

-- The places of a hotel with their point: what the hotel page, Эвал and the future «Вид из отеля» read. The
-- bearing is from the hotel's point in `hotels` (degrees from north, clockwise), the straight distance in metres.
create or replace view public.ota_hotel_places
with (security_invoker = true)
as
select
  'ota-' || hp.master_id as hotel_id,
  hp.master_id,
  p.region_id,
  p.type,
  p.subtype,
  p.name,
  p.name_en,
  hp.distance_m,
  hp.is_nearby,
  hp.is_top_poi,
  hp.is_transport_hub,
  extensions.st_y(p.geom) as lat,
  extensions.st_x(p.geom) as lon,
  round(extensions.st_distance(p.geom::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(h.lon, h.lat), 4326)::extensions.geography))::int as straight_m,
  round(degrees(extensions.st_azimuth(extensions.st_setsrid(extensions.st_makepoint(h.lon, h.lat), 4326)::extensions.geography, p.geom::extensions.geography)))::int % 360 as bearing_deg
from public.ota_hotel_pois hp
join public.ota_pois p on p.region_id = hp.region_id
join public.hotels h on h.id = 'ota-' || hp.master_id;

-- A real hotel's Wi‑Fi speed is unknown: Ostrovok does not give it, and a generated one would be made up.
alter table public.hotels alter column wifi_mbps drop not null;
alter table public.hotels alter column wifi_mbps drop default;

-- Everyone reads them, as the catalogue; only the service role (which bypasses RLS) writes them.
alter table public.ota_hotel_pages enable row level security;
alter table public.ota_pois enable row level security;
alter table public.ota_hotel_pois enable row level security;
alter table public.ota_rate_spec_tags enable row level security;

drop policy if exists "ota_hotel_pages_select_all" on public.ota_hotel_pages;
create policy "ota_hotel_pages_select_all" on public.ota_hotel_pages for select to anon, authenticated using (true);

drop policy if exists "ota_pois_select_all" on public.ota_pois;
create policy "ota_pois_select_all" on public.ota_pois for select to anon, authenticated using (true);

drop policy if exists "ota_hotel_pois_select_all" on public.ota_hotel_pois;
create policy "ota_hotel_pois_select_all" on public.ota_hotel_pois for select to anon, authenticated using (true);

drop policy if exists "ota_rate_spec_tags_select_all" on public.ota_rate_spec_tags;
create policy "ota_rate_spec_tags_select_all" on public.ota_rate_spec_tags
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate
  on public.ota_hotel_pages, public.ota_pois, public.ota_hotel_pois, public.ota_rate_spec_tags
  from anon, authenticated;
revoke all on public.ota_hotel_places from anon, authenticated;
grant select on public.ota_hotel_places to anon, authenticated;
