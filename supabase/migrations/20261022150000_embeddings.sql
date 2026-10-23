-- Semantic search: a vector per catalog object (hotels, routes) from `nvidia/nemotron-3.5-embed-8b`.
-- The model gives 4096 numbers; HNSW indexes at most 4000 (`halfvec`), so `npm run db:embed` asks for the
-- first 2048 (the model is Matryoshka-trained: `dimensions: 2048`) and stores them as `halfvec(2048)`.
-- Idempotent: safe to re-run on a database that already has these objects.

create extension if not exists vector with schema extensions;

create table if not exists public.embeddings (
  kind text not null check (kind in ('hotel', 'route')),
  ref_id text not null,
  destination_id text not null references public.destinations (id),
  model text not null,
  -- sha256 of the model, the dimensions and `content`: an unchanged object is not sent to the model again.
  content_hash text not null,
  -- The text the vector is of; the reranker reads it too.
  content text not null,
  embedding extensions.halfvec(2048) not null,
  updated_at timestamptz not null default now(),
  primary key (kind, ref_id)
);

create index if not exists embeddings_embedding_idx
  on public.embeddings using hnsw (embedding extensions.halfvec_cosine_ops);
create index if not exists embeddings_kind_destination_idx on public.embeddings (kind, destination_id);

-- Nobody reads the table directly: the functions below are the way in. Only the service role writes it.
alter table public.embeddings enable row level security;
revoke all on public.embeddings from anon, authenticated;

-- The `match_count` objects of `match_kind` nearest to `query_embedding` by cosine, optionally in the given
-- cities; `similarity` is 1 − cosine distance.
create or replace function public.match_embeddings(
  query_embedding extensions.halfvec(2048),
  match_kind text,
  destination_ids text[] default null,
  match_count int default 20
)
returns table (ref_id text, destination_id text, content text, similarity double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select e.ref_id, e.destination_id, e.content, 1 - (e.embedding operator(extensions.<=>) query_embedding)
  from public.embeddings e
  where e.kind = match_kind and (destination_ids is null or e.destination_id = any (destination_ids))
  order by e.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 100);
$$;

-- The other hotels of `hotel_id`'s city, closest first. With a profile (the hotels of the traveller's
-- favourites, bookings and plans) the score blends the likeness to the hotel (0.6) and to the profile's
-- mean vector (0.4); without one it is the likeness to the hotel alone.
create or replace function public.similar_hotels(
  hotel_id text,
  profile_ids text[] default '{}',
  match_count int default 10
)
returns table (ref_id text, similarity double precision, profile_similarity double precision, score double precision)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select t.embedding, t.destination_id from public.embeddings t where t.kind = 'hotel' and t.ref_id = hotel_id
  ),
  profile as (
    select extensions.avg(p.embedding) as embedding
    from public.embeddings p
    where p.kind = 'hotel' and p.ref_id = any (coalesce(profile_ids, '{}'))
  ),
  scored as (
    select
      e.ref_id,
      1 - (e.embedding operator(extensions.<=>) target.embedding) as similarity,
      1 - (e.embedding operator(extensions.<=>) profile.embedding) as profile_similarity
    from public.embeddings e
    cross join target
    cross join profile
    where e.kind = 'hotel' and e.destination_id = target.destination_id and e.ref_id <> hotel_id
  )
  select
    s.ref_id,
    s.similarity,
    s.profile_similarity,
    coalesce(0.6 * s.similarity + 0.4 * s.profile_similarity, s.similarity) as score
  from scored s
  order by 4 desc, s.ref_id
  limit least(greatest(match_count, 1), 100);
$$;

revoke execute on function public.match_embeddings(extensions.halfvec, text, text[], int) from public;
revoke execute on function public.similar_hotels(text, text[], int) from public;
grant execute on function public.match_embeddings(extensions.halfvec, text, text[], int)
  to anon, authenticated, service_role;
grant execute on function public.similar_hotels(text, text[], int) to anon, authenticated, service_role;
