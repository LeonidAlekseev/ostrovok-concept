-- Supabase foundation: profiles of the signed-in users and the hotel catalog.
-- Idempotent: safe to re-run on a database that already has these objects.

-- Profiles ----------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- A profile for every new user; the name comes from the sign-up data (`options.data.name`).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users created before the trigger.
insert into public.profiles (id, name)
select id, nullif(btrim(raw_user_meta_data ->> 'name'), '')
from auth.users
on conflict (id) do nothing;

-- Catalog: key columns for queries, the whole object in `data` -----------------------------------

create table if not exists public.destinations (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.hotels (
  id text primary key,
  destination_id text not null references public.destinations (id),
  stars int not null check (stars between 1 and 5),
  rating numeric(3, 1) not null,
  price_from int not null,
  lat double precision not null,
  lon double precision not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists hotels_destination_id_idx on public.hotels (destination_id);

-- Everyone reads the catalog; only the service role (which bypasses RLS) writes it.
alter table public.destinations enable row level security;
alter table public.hotels enable row level security;

drop policy if exists "destinations_select_all" on public.destinations;
create policy "destinations_select_all" on public.destinations for select to anon, authenticated using (true);

drop policy if exists "hotels_select_all" on public.hotels;
create policy "hotels_select_all" on public.hotels for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.destinations, public.hotels from anon, authenticated;
