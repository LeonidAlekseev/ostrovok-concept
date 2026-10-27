-- Removes what nothing calls and the grants nobody needs (refactor-cleanup):
-- * `hotel_view_lines` (20261026150000, 20261026150500): replaced by `hotel_view_eyes` (20261027150000), which gives
--   every floor in one call; neither src/ nor scripts/ call it since.
-- * `similar_hotels` (20261022150000): the hotels of a route by the vectors; its last caller went with the routes
--   (#163, «hotels only»). The semantic search goes through `match_embeddings`.
-- * The anon role's grants on `public.profiles`: the default grants of the schema gave it every privilege (TRUNCATE
--   included, which RLS does not check). Only a signed-in user reads and updates their own profile, as the policies
--   say; the trigger `handle_new_user` inserts as the definer. The other tables of the users already have no anon grants.
--
-- Rollback: re-run 20261026150500_hotel_view_horizon.sql and the `similar_hotels` part of 20261022150000_embeddings.sql;
-- `grant select, insert, update, delete, truncate, references, trigger on public.profiles to anon;`.
drop function if exists public.hotel_view_lines(double precision, double precision, double precision, jsonb);
drop function if exists public.similar_hotels(text, text[], int);

revoke all on table public.profiles from anon;
