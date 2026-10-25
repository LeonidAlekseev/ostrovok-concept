-- Hotels only (#163): the site no longer reads or writes ready-made routes, trip plans or route vectors.
-- Idempotent: safe to re-run on a database that already lacks these objects.
--
-- Rollback: re-apply 20261022120000_routes.sql, then 20261022170500_trips.sql; widen the check below back to
-- `kind in ('hotel', 'route')`; load the rows from the backup taken before this migration
-- (`\copy ... from '<file>.csv' with (format csv, header)`: routes.csv, trips.csv, embeddings_route.csv).

-- Its policies, indexes and the trips_touch_updated_at trigger go with the table.
drop table if exists public.trips;

-- Only trips_touch_updated_at used it; without cascade the drop fails if anything else still does.
drop function if exists public.touch_updated_at();

drop table if exists public.routes;

delete from public.embeddings where kind = 'route';

alter table public.embeddings drop constraint if exists embeddings_kind_check;
alter table public.embeddings add constraint embeddings_kind_check check (kind = 'hotel');
