-- Where a place is: the point of an OSM place or a place of Ostrovok (`{ "lat": …, "lon": … }`), written by
-- `npm run db:features`, so the graph of a hotel (`GET /api/hotels/{hotelId}/relations`) reads it from the store and
-- not from the cache `osm_places_near`, which has lost some places. `{}` for the entities that have no point.
-- Idempotent: safe to re-run.
--
-- Rollback: alter table public.entities drop column if exists metadata;
alter table public.entities
  add column if not exists metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object');
