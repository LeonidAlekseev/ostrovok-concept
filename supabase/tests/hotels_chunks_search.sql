-- «Углубленный поиск» (deep-search): `hotels_chunks_search` finds the chunks of the documents of many hotels in one
-- read — by words and by meaning, the best few of each hotel, a review, a description and a hotelier's answer alike;
-- a hotel outside the list and the documents of the others are not returned. Everything is rolled back. Run against
-- the database (the transaction pooler: only `set local`):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hotels_chunks_search.sql
-- A failed check raises an exception and psql stops with it; success prints «hotels chunks search: ok».

begin;

create temporary table two_hotels on commit drop as select id from public.hotels order by id limit 2;
grant select on two_hotels to anon, authenticated;

insert into public.evidence (id, type, title, provider, external_id)
values
  ('00000000-0000-4000-8000-0000000006e1', 'review', 'Отзыв гостя', 'Островок', 'deep-1'),
  ('00000000-0000-4000-8000-0000000006e2', 'ota_page', 'Описание отеля', 'Островок', 'deep-2'),
  ('00000000-0000-4000-8000-0000000006e3', 'hotelier', 'Ответ отельера', 'Отельер', 'deep-3');
insert into public.documents (id, kind, hotel_id, evidence_id, text)
values
  ('00000000-0000-4000-8000-0000000007d1', 'review', (select min(id) from two_hotels),
    '00000000-0000-4000-8000-0000000006e1', 'Завтрак отличный'),
  ('00000000-0000-4000-8000-0000000007d2', 'description', (select min(id) from two_hotels),
    '00000000-0000-4000-8000-0000000006e2', 'Шведский стол по утрам'),
  ('00000000-0000-4000-8000-0000000007d3', 'hotelier_answer', (select max(id) from two_hotels),
    '00000000-0000-4000-8000-0000000006e3', 'Завтрак с 7 до 11');
insert into public.document_chunks (document_id, ord, text, embedding)
values
  ('00000000-0000-4000-8000-0000000007d1', 0, 'Завтрак отличный, всё свежее',
    ('[' || array_to_string(array_fill(0.01::real, array[2048]), ',') || ']')::extensions.halfvec),
  ('00000000-0000-4000-8000-0000000007d2', 0, 'Шведский стол по утрам',
    ('[' || array_to_string(array_fill(-0.01::real, array[2048]), ',') || ']')::extensions.halfvec),
  ('00000000-0000-4000-8000-0000000007d3', 0, 'Завтрак подаём с 7 до 11', null);

set local role anon;
do $$
declare
  vec constant extensions.halfvec := ('[' || array_to_string(array_fill(0.01::real, array[2048]), ',') || ']')::extensions.halfvec;
  ids constant text[] := (select array_agg(id) from two_hotels);
  n integer;
begin
  -- By words: the chunks of both hotels that name the topic, the description's (no word) not among them.
  select count(*) into n from public.hotels_chunks_search(ids, 'завтрак', null, 5);
  if n <> 2 then raise exception 'by words: % rows', n; end if;
  if exists (select 1 from public.hotels_chunks_search(ids, 'завтрак', null, 5) where vector_place is not null) then
    raise exception 'a place by meaning without a vector';
  end if;
  -- By meaning: the two chunks with a vector, the closer first (the same vector is 1, the opposite one −1).
  select count(*) into n from public.hotels_chunks_search(ids, '', vec, 5);
  if n <> 2 then raise exception 'by meaning: % rows', n; end if;
  if not exists (
    select 1 from public.hotels_chunks_search(ids, '', vec, 5)
    where kind = 'review' and vector_place = 1 and abs(similarity - 1) < 0.001
  ) or not exists (
    select 1 from public.hotels_chunks_search(ids, '', vec, 5)
    where kind = 'description' and vector_place = 2 and similarity < -0.99
  ) then raise exception 'the closeness is wrong'; end if;
  -- Both: the review's chunk is one row found by both rankings; the kinds are the documents'.
  select count(*) into n from public.hotels_chunks_search(ids, 'завтрак', vec, 5);
  if n <> 3 then raise exception 'both: % rows', n; end if;
  if not exists (
    select 1 from public.hotels_chunks_search(ids, 'завтрак', vec, 5)
    where kind = 'review' and fts_place = 1 and vector_place = 1
  ) then raise exception 'a chunk of both rankings is not one row'; end if;
  if (select array_agg(distinct kind order by kind) from public.hotels_chunks_search(ids, 'завтрак', vec, 5))
    <> array['description', 'hotelier_answer', 'review'] then
    raise exception 'the kinds are wrong';
  end if;
  -- One hotel of the list: the other's documents are not returned.
  select count(*) into n from public.hotels_chunks_search(array[(select max(id) from two_hotels)], 'завтрак', vec, 5);
  if n <> 1 then raise exception 'one hotel: % rows', n; end if;
  -- The best few of each hotel.
  select count(*) into n from public.hotels_chunks_search(ids, 'завтрак', vec, 1) where hotel_id = (select min(id) from two_hotels);
  if n > 2 then raise exception 'per hotel: % rows', n; end if;
  raise notice 'hotels chunks search: ok';
end $$;
reset role;

rollback;
