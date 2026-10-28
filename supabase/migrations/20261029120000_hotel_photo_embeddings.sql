-- Search of hotels by a photo: a vector per catalog photo from `nvidia/llama-nemotron-embed-vl-1b-v2` (photos and text
-- share its space, 2048 numbers). Another model than `embeddings`, so its own table. `npm run db:embed:photos` fills
-- it (Valencia only); `match_hotel_photos` finds the hotels whose photos are nearest to a photo's vector.
-- Idempotent: safe to re-run on a database that already has these objects.

create extension if not exists vector with schema extensions;

create table if not exists public.hotel_photo_embeddings (
  -- No foreign key, as in `embeddings`: a rebuild of `hotels` keeps the vectors; the script removes the orphans.
  hotel_id text not null,
  -- The photo's path on the CDN without the size: the same picture keeps its key when the size changes.
  photo_key text not null,
  destination_id text not null references public.destinations (id),
  -- sha256 of the model, the dimensions and `photo_key`: a photo with a vector of this model is not sent again.
  content_hash text not null,
  embedding extensions.halfvec(2048) not null,
  updated_at timestamptz not null default now(),
  primary key (hotel_id, photo_key)
);

create index if not exists hotel_photo_embeddings_embedding_idx
  on public.hotel_photo_embeddings using hnsw (embedding extensions.halfvec_cosine_ops);
create index if not exists hotel_photo_embeddings_destination_idx on public.hotel_photo_embeddings (destination_id);

-- Nobody reads the table directly: `match_hotel_photos` is the way in. Only the service role writes it.
alter table public.hotel_photo_embeddings enable row level security;
revoke all on public.hotel_photo_embeddings from anon, authenticated;

-- The `match_count` hotels whose photos are nearest to `query_embedding` by cosine, optionally in the given
-- cities, best first; `similarity` is 1 − the distance of the hotel's nearest photo. The HNSW index gives the 200
-- nearest photos, the hotels are made of them.
create or replace function public.match_hotel_photos(
  query_embedding extensions.halfvec(2048),
  destination_ids text[] default null,
  match_count int default 20
)
returns table (hotel_id text, destination_id text, similarity double precision)
language sql
stable
security definer
set search_path = ''
as $$
  with nearest as (
    select p.hotel_id, p.destination_id, p.embedding operator(extensions.<=>) query_embedding as distance
    from public.hotel_photo_embeddings p
    where destination_ids is null or p.destination_id = any (destination_ids)
    order by p.embedding operator(extensions.<=>) query_embedding
    limit 200
  )
  select n.hotel_id, n.destination_id, 1 - min(n.distance) as similarity
  from nearest n
  group by n.hotel_id, n.destination_id
  order by min(n.distance), n.hotel_id
  limit least(greatest(match_count, 1), 100);
$$;

revoke execute on function public.match_hotel_photos(extensions.halfvec, text[], int) from public;
grant execute on function public.match_hotel_photos(extensions.halfvec, text[], int) to anon, authenticated, service_role;
