-- The facade's bands of a hotel kept in its `hotel_features` row, so the page and Эвал read them in a few ms instead of
-- calling `hotel_noise_facade` on every request (seconds on cold geometries, and the anon role's `statement_timeout`
-- cancels it now and then). `noise_facade` is the answer of `hotel_noise_facade(lat, lon)` as it is — `{zone, bands}` —
-- filled by `npm run db:features`; null until that run (the app asks the function live then).
--
-- Idempotent. Rollback: `alter table public.hotel_features drop column if exists noise_facade;`
alter table public.hotel_features add column if not exists noise_facade jsonb;
