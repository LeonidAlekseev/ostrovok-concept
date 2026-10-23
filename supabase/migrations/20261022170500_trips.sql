-- Trip plans: a user's copy of a ready-made route («Повторить маршрут»). The snapshot of the route and the
-- user's edits (src/lib/trip.ts, `TripData`) live in `data`; changing the route never changes a copy.
-- Idempotent: safe to re-run on a database that already has these objects.

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The route the plan was copied from; the copy outlives a removed route.
  route_id text references public.routes (id) on delete set null,
  data jsonb not null check (octet_length(data::text) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on public.trips (user_id, updated_at desc);

-- Only the owner reads and writes a plan; shared plans come with the trip rooms (stage D).
alter table public.trips enable row level security;

drop policy if exists "trips_select_own" on public.trips;
create policy "trips_select_own" on public.trips
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "trips_insert_own" on public.trips;
create policy "trips_insert_own" on public.trips
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "trips_update_own" on public.trips;
create policy "trips_update_own" on public.trips
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "trips_delete_own" on public.trips;
create policy "trips_delete_own" on public.trips
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.trips from anon;
grant select, insert, update, delete on public.trips to authenticated;

-- The time of the last edit, whoever writes the row.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();
