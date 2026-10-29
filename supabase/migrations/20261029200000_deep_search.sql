-- «Углубленный поиск» Эвала (deep-search): the exact search by words and the search by meaning run over the documents
-- of many hotels in one read, not one read a hotel (hundreds of reads of Valencia did not fit in the answer's time).
-- The documents are the guests' reviews, the hotels' descriptions (`description`, from the hotel's Ostrovok page) and the
-- hotels' knowledge from their hoteliers (`hotelier_answer`: only what the hotelier allowed, `shareable`).
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (delete the descriptions' documents first: `delete from public.documents where kind = 'description'`):
--   drop function if exists public.hotels_chunks_search(text[], text, extensions.halfvec, integer);
--   alter table public.documents drop constraint if exists documents_kind_check;
--   alter table public.documents add constraint documents_kind_check check (kind in ('review', 'hotelier_answer'));

alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents
  add constraint documents_kind_check check (kind in ('review', 'hotelier_answer', 'description'));

-- The best chunks of each hotel in `hotel_ids` (at most 500) for `query`: by words (`fts_place`: the Russian stemmer,
-- websearch syntax) and, with `query_embedding`, by meaning (`vector_place`, `similarity`: 1 − cosine distance), each
-- ranked within its hotel, at most `per_hotel` chunks by each. A chunk found by both is one row. Runs as the caller:
-- the chunks are public.
create or replace function public.hotels_chunks_search(
  hotel_ids text[],
  query text,
  query_embedding extensions.halfvec(2048) default null,
  per_hotel integer default 6
)
returns table (
  hotel_id text,
  chunk_id uuid,
  document_id uuid,
  evidence_id uuid,
  kind text,
  ord smallint,
  text text,
  metadata jsonb,
  fts_place integer,
  vector_place integer,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select pg_catalog.websearch_to_tsquery('russian'::regconfig, left(coalesce(query, ''), 500)) as tsq,
      least(greatest(coalesce(per_hotel, 6), 1), 20) as n
  ),
  own as (
    select d.hotel_id, c.id, c.fts, c.embedding
    from public.documents d
    join public.document_chunks c on c.document_id = d.id
    where d.hotel_id = any (hotel_ids[1:500])
  ),
  fts as (
    select r.id, r.hotel_id, r.place
    from (
      select o.id, o.hotel_id,
        row_number() over (partition by o.hotel_id order by pg_catalog.ts_rank(o.fts, q.tsq) desc, o.id)::integer as place,
        q.n
      from own o cross join q
      where o.fts operator(pg_catalog.@@) q.tsq
    ) r
    where r.place <= r.n
  ),
  vec as (
    select r.id, r.hotel_id, r.place, r.similarity
    from (
      select o.id, o.hotel_id,
        row_number() over (partition by o.hotel_id order by o.embedding operator(extensions.<=>) query_embedding, o.id)::integer as place,
        1 - (o.embedding operator(extensions.<=>) query_embedding) as similarity,
        q.n
      from own o cross join q
      where query_embedding is not null and o.embedding is not null
    ) r
    where r.place <= r.n
  )
  select coalesce(f.hotel_id, v.hotel_id), c.id, d.id, d.evidence_id, d.kind, c.ord, c.text, c.metadata,
    f.place, v.place, v.similarity
  from fts f
  full join vec v on v.id = f.id
  join public.document_chunks c on c.id = coalesce(f.id, v.id)
  join public.documents d on d.id = c.document_id
  order by 1, coalesce(f.place, v.place), c.id;
$$;

revoke all on function public.hotels_chunks_search(text[], text, extensions.halfvec, integer) from public;
grant execute on function public.hotels_chunks_search(text[], text, extensions.halfvec, integer)
  to anon, authenticated, service_role;
