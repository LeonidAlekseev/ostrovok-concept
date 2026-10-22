-- The kind of a place to stay, the speed of its Wi-Fi and a workspace: hotels, hostels, apartments and villas.
-- Rows that exist before `npm run db:seed` count as hotels with a default speed; the seed writes the real values.
alter table public.hotels add column if not exists stay_type text not null default 'hotel'
  check (stay_type in ('hotel', 'hostel', 'apartments', 'villa'));
alter table public.hotels add column if not exists wifi_mbps int not null default 100;
alter table public.hotels add column if not exists workspace boolean not null default false;
