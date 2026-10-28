-- `hotel_photo_embeddings` and `match_hotel_photos`: the table is closed to the client roles, the function gives the
-- hotels by their nearest photo, once each, best first, and honours the city filter. Everything is rolled back. Run
-- against the database (the transaction pooler: only `set local`):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hotel_photo_embeddings.sql
-- A failed check raises an exception and psql stops with it; success prints «hotel_photo_embeddings: ok».

begin;

-- A vector of 2048 numbers with `a` at the first place and `b` at the second.
create function pg_temp.vec(a real, b real) returns extensions.halfvec(2048)
language sql as $$
  select ('[' || array_to_string(array(select case i when 1 then a when 2 then b else 0 end
    from generate_series(1, 2048) i), ',') || ']')::extensions.halfvec(2048)
$$;

insert into public.hotel_photo_embeddings (hotel_id, photo_key, destination_id, content_hash, embedding)
values
  ('t-near', 'a', 'valencia', 'h', pg_temp.vec(1, 0)),
  ('t-near', 'b', 'valencia', 'h', pg_temp.vec(0, 1)),
  ('t-mid', 'a', 'valencia', 'h', pg_temp.vec(1, 1)),
  ('t-far', 'a', 'valencia', 'h', pg_temp.vec(0, 1)),
  ('t-other', 'a', 'prague', 'h', pg_temp.vec(1, 0));

do $$
declare
  ids text[];
  sim double precision;
begin
  -- Each hotel once, by its nearest photo: t-near and t-other (1.0), then t-mid, then t-far.
  select array_agg(m.hotel_id order by m.similarity desc, m.hotel_id) into ids
  from public.match_hotel_photos(pg_temp.vec(1, 0)) m;
  if ids <> array['t-near', 't-other', 't-mid', 't-far'] then
    raise exception 'order or duplicates: %', ids;
  end if;

  select m.similarity into sim from public.match_hotel_photos(pg_temp.vec(1, 0)) m where m.hotel_id = 't-near';
  if abs(sim - 1) > 0.001 then raise exception 'similarity of t-near: %', sim; end if;

  -- The city filter and the count.
  select array_agg(m.hotel_id) into ids
  from public.match_hotel_photos(pg_temp.vec(1, 0), array['valencia'], 2) m;
  if ids <> array['t-near', 't-mid'] then raise exception 'filter or count: %', ids; end if;
end $$;

-- The client roles read nothing of the table; the function is open to them.
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.hotel_photo_embeddings;
    raise exception 'anon read the table';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.match_hotel_photos(pg_temp.vec(1, 0));
  if n <> 4 then raise exception 'anon match: %', n; end if;
end $$;

rollback;
\echo hotel_photo_embeddings: ok
