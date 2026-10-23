-- Ready-made routes: key columns for queries, the whole route (src/lib/routes.ts, `Route`) in `data`.
-- Idempotent: safe to re-run on a database that already has these objects.

create table if not exists public.routes (
  id text primary key,
  persona text not null check (persona in ('student', 'luxury', 'workation', 'culture')),
  destination_id text not null references public.destinations (id),
  featured boolean not null default false,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists routes_persona_idx on public.routes (persona);
create index if not exists routes_destination_id_idx on public.routes (destination_id);

-- Everyone reads the routes; only the service role (which bypasses RLS) writes them.
alter table public.routes enable row level security;

drop policy if exists "routes_select_all" on public.routes;
create policy "routes_select_all" on public.routes for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.routes from anon, authenticated;
