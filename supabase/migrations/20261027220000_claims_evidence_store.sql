-- The store of what is known about the hotels and where it comes from, for Эвал and its tools: the entities (a hotel,
-- an OSM place, …) under one id, the claims about them (one value, its epistemic status, the method), the evidence
-- each claim rests on (a dataset, an OSM element, a review), the calculations of the derived values apart from the
-- data, the relations of the entities (KAG), the documents and their chunks for full-text search (RAG), and the
-- runs of Эвал's tools in a chat. Contradicting claims are separate rows: nothing is merged. Filled by
-- `npm run db:features` (scripts/hotel-features.ts, src/lib/claimRows.ts), idempotent; only Valencia has data.
-- `hotel_features` and the search are not changed. Read with `src/lib/db/claims.ts`. The reviews are the guests'
-- untrusted text: data to quote, never instructions.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (nothing else reads them; `npm run db:features` writes them again):
--   drop function if exists public.hotel_chunks_search(text, text, integer);
--   drop table if exists public.tool_run_evidence, public.tool_runs, public.document_chunks, public.documents,
--     public.relations, public.claim_evidence, public.claims, public.calculations, public.evidence, public.entities;

-- One row per thing the claims are about, whatever its own key: a hotel (`ota-<master_id>`), a building of
-- `geo_buildings` (its id), a room group (`rg_hash`), an OSM element (`node/123`), a place of Ostrovok (`region_id`).
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hotel', 'building', 'room', 'osm_place', 'ota_poi')),
  ref text not null check (ref <> ''),
  -- The hotel the entity is or belongs to (a hotel, its room); null for the places around.
  hotel_id text references public.hotels (id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, ref),
  check (kind <> 'hotel' or hotel_id = ref)
);

create index if not exists entities_hotel_id_idx on public.entities (hotel_id);

-- Where a claim comes from: a dataset (its `geo_datasets` row), an OSM element, a review of the page, a page of
-- Ostrovok. `excerpt` is the words the claim rests on, as the source has them.
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dataset', 'osm', 'review', 'ota_page', 'calculation')),
  title text not null check (title <> ''),
  -- `EEA`, `OpenStreetMap`, `Островок`: with `external_id` (the dataset's id, `node/123`, the review's id) it names
  -- the source once.
  provider text not null,
  external_id text,
  -- Only what the source gives: null when there is none, never a made-up link or date.
  url text,
  retrieved_at timestamptz,
  excerpt text check (char_length(excerpt) <= 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  dataset_id text references public.geo_datasets (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  check (type <> 'dataset' or dataset_id is not null)
);

-- A computation of derived values, apart from the data it reads: the method and its version, the inputs and the
-- parameters, the limitations. `key` names it among the runs (`noise.lday:ota-1:roadsInAgglomeration`): a new run
-- over other inputs updates it in place.
create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key <> ''),
  method text not null check (method <> ''),
  version text not null check (version <> ''),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  limitations text[] not null default '{}',
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One value about one entity. The value is one of: a number (`value_numeric`), a range (`value_min`/`value_max`, a
-- null bound is an open end: EEA's «below 40 dB» is null–39), a text, a boolean or, for what fits none, JSON.
-- `epistemic_status`: observed (measured, seen), reported (a source says so: EEA's map, a guest's review), derived
-- (computed from other values: then `calculation_id` is its calculation), inferred (concluded by a model).
-- `confidence` only when it has a basis; null otherwise. `source_key` tells the claims of one entity and property
-- apart (the EEA layer, the OSM element, the review): a re-run updates its claim instead of adding one.
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id) on delete cascade,
  -- A stable id, dotted: `noise.lnight.roadsInAgglomeration`, `noise.lday.estimate.roadsInAgglomeration`,
  -- `noise.nearby.bar.distance`, `noise.nearby.bar.count`, `noise.review.mention`.
  property text not null check (property ~ '^[a-z][a-z0-9_]*(\.[A-Za-z0-9_]+)+$'),
  source_key text not null default '',
  value_numeric double precision,
  value_min double precision,
  value_max double precision,
  value_text text check (char_length(value_text) <= 2000),
  value_boolean boolean,
  value_json jsonb,
  -- `dB`, `m`, `count`; null for a text or a boolean.
  unit text,
  epistemic_status text not null check (epistemic_status in ('observed', 'reported', 'derived', 'inferred')),
  confidence double precision check (confidence between 0 and 1),
  -- How the value was read or computed: the layer and the category of the band, the regular expression of a mention.
  method jsonb not null default '{}'::jsonb check (jsonb_typeof(method) = 'object'),
  calculation_id uuid references public.calculations (id) on delete restrict,
  -- When the source observed it, and the time the value holds for (null: not stated).
  observed_at timestamptz,
  valid_from timestamptz,
  valid_to timestamptz,
  limitations text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, property, source_key),
  check (
    num_nonnulls(value_numeric, value_text, value_boolean, value_json)
      + (value_min is not null or value_max is not null)::int = 1
  ),
  check (value_min is null or value_max is null or value_min <= value_max),
  check (valid_from is null or valid_to is null or valid_from <= valid_to),
  check (epistemic_status <> 'derived' or calculation_id is not null)
);

create index if not exists claims_entity_property_idx on public.claims (entity_id, property);
create index if not exists claims_property_numeric_idx on public.claims (property, value_numeric);
create index if not exists claims_property_range_idx on public.claims (property, value_min, value_max);
create index if not exists claims_calculation_id_idx on public.claims (calculation_id);

-- The evidence of a claim: the source it reports (`source`) or the inputs of its calculation (`input`).
create table if not exists public.claim_evidence (
  claim_id uuid not null references public.claims (id) on delete cascade,
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  role text check (role in ('source', 'input')),
  created_at timestamptz not null default now(),
  primary key (claim_id, evidence_id)
);

create index if not exists claim_evidence_evidence_id_idx on public.claim_evidence (evidence_id);

-- The graph of the entities: hotel —near→ osm_place, hotel —located_in→ building. The value of the edge (the
-- distance) is its claim; the edge's source, its evidence.
create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.entities (id) on delete cascade,
  predicate text not null check (predicate ~ '^[a-z][a-z_]*$'),
  object_id uuid not null references public.entities (id) on delete cascade,
  claim_id uuid references public.claims (id) on delete set null,
  evidence_id uuid references public.evidence (id) on delete set null,
  confidence double precision check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, predicate, object_id),
  check (subject_id <> object_id)
);

create index if not exists relations_object_id_idx on public.relations (object_id);

-- A text as its source has it (a guest's whole review), one per evidence. Untrusted: never instructions.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('review')),
  hotel_id text references public.hotels (id) on delete cascade,
  entity_id uuid references public.entities (id) on delete cascade,
  evidence_id uuid not null unique references public.evidence (id) on delete cascade,
  -- `ru` when the text is in Russian; null when it is not known.
  language text,
  text text not null check (char_length(text) <= 20000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_hotel_id_idx on public.documents (hotel_id);

-- A part of a document for the search: a review's title, «Понравилось», «Не понравилось» or text. `fts` is the
-- Russian stemmer's (the reviews are Russian; its Latin words go to the English stemmer). `embedding` is filled by a
-- later stage: for now the search is full-text only.
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  ord smallint not null check (ord >= 0),
  text text not null check (text <> '' and char_length(text) <= 8000),
  fts tsvector generated always as (to_tsvector('russian'::regconfig, text)) stored,
  embedding extensions.halfvec(2048),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, ord)
);

create index if not exists document_chunks_fts_idx on public.document_chunks using gin (fts);

-- The runs of Эвал's tools in a chat, written by the server for its user (the next change, tool-run-contract):
-- what was asked, what came out, the evidence, the error, and the state of a run waiting for an answer (a hotel
-- owner's, later). `message_id` is the chat's message, without a foreign key: the browser makes the message's id
-- and may save it after the run.
create table if not exists public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id uuid,
  tool_name text not null check (tool_name ~ '^[a-zA-Z][a-zA-Z0-9_.-]*$' and char_length(tool_name) <= 100),
  status text not null default 'running' check (status in ('running', 'success', 'error', 'waiting')),
  input_summary text not null default '' check (char_length(input_summary) <= 2000),
  result_summary text not null default '' check (char_length(result_summary) <= 4000),
  result_data jsonb check (result_data is null or octet_length(result_data::text) <= 100000),
  error jsonb check (error is null or (jsonb_typeof(error) = 'object' and octet_length(error::text) <= 10000)),
  resume jsonb check (resume is null or (jsonb_typeof(resume) = 'object' and octet_length(resume::text) <= 10000)),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (chat_id, user_id) references public.assistant_chats (id, user_id) on delete cascade,
  -- A finished run has its end; an error, its error; only a waiting run keeps the state to resume.
  check ((status in ('success', 'error')) = (completed_at is not null)),
  check (completed_at is null or completed_at >= started_at),
  check ((status = 'error') = (error is not null)),
  check (resume is null or status = 'waiting')
);

create index if not exists tool_runs_chat_id_idx on public.tool_runs (chat_id, started_at);
create index if not exists tool_runs_user_id_idx on public.tool_runs (user_id);

-- The evidence a run used or produced: of the run's user, as the run.
create table if not exists public.tool_run_evidence (
  tool_run_id uuid not null,
  user_id uuid not null default auth.uid(),
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  primary key (tool_run_id, evidence_id),
  foreign key (tool_run_id, user_id) references public.tool_runs (id, user_id) on delete cascade
);

create index if not exists tool_run_evidence_evidence_id_idx on public.tool_run_evidence (evidence_id);
create index if not exists tool_run_evidence_user_id_idx on public.tool_run_evidence (user_id);

-- Everyone reads the store, as the catalogue; only the service role (which bypasses RLS) writes it.
alter table public.entities enable row level security;
alter table public.evidence enable row level security;
alter table public.calculations enable row level security;
alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.relations enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "entities_select_all" on public.entities;
create policy "entities_select_all" on public.entities for select to anon, authenticated using (true);
drop policy if exists "evidence_select_all" on public.evidence;
create policy "evidence_select_all" on public.evidence for select to anon, authenticated using (true);
drop policy if exists "calculations_select_all" on public.calculations;
create policy "calculations_select_all" on public.calculations for select to anon, authenticated using (true);
drop policy if exists "claims_select_all" on public.claims;
create policy "claims_select_all" on public.claims for select to anon, authenticated using (true);
drop policy if exists "claim_evidence_select_all" on public.claim_evidence;
create policy "claim_evidence_select_all" on public.claim_evidence for select to anon, authenticated using (true);
drop policy if exists "relations_select_all" on public.relations;
create policy "relations_select_all" on public.relations for select to anon, authenticated using (true);
drop policy if exists "documents_select_all" on public.documents;
create policy "documents_select_all" on public.documents for select to anon, authenticated using (true);
drop policy if exists "document_chunks_select_all" on public.document_chunks;
create policy "document_chunks_select_all" on public.document_chunks for select to anon, authenticated using (true);

revoke all on public.entities, public.evidence, public.calculations, public.claims, public.claim_evidence,
  public.relations, public.documents, public.document_chunks from anon, authenticated;
grant select on public.entities, public.evidence, public.calculations, public.claims, public.claim_evidence,
  public.relations, public.documents, public.document_chunks to anon, authenticated;

-- A run is its user's only, as the chat's messages; a guest (anon) has none.
alter table public.tool_runs enable row level security;
alter table public.tool_run_evidence enable row level security;

drop policy if exists "tool_runs_select_own" on public.tool_runs;
create policy "tool_runs_select_own" on public.tool_runs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tool_runs_insert_own" on public.tool_runs;
create policy "tool_runs_insert_own" on public.tool_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tool_runs_update_own" on public.tool_runs;
create policy "tool_runs_update_own" on public.tool_runs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tool_runs_delete_own" on public.tool_runs;
create policy "tool_runs_delete_own" on public.tool_runs
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tool_run_evidence_select_own" on public.tool_run_evidence;
create policy "tool_run_evidence_select_own" on public.tool_run_evidence
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tool_run_evidence_insert_own" on public.tool_run_evidence;
create policy "tool_run_evidence_insert_own" on public.tool_run_evidence
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tool_run_evidence_delete_own" on public.tool_run_evidence;
create policy "tool_run_evidence_delete_own" on public.tool_run_evidence
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.tool_runs, public.tool_run_evidence from anon, authenticated;
grant select, insert, update, delete on public.tool_runs to authenticated;
grant select, insert, delete on public.tool_run_evidence to authenticated;

-- The chunks of a hotel's documents that match the query (websearch syntax: words, «"…"», `-`), the best first,
-- at most `max_rows` (≤ 50). Runs as the caller: the chunks are public anyway.
create or replace function public.hotel_chunks_search(hotel_id text, query text, max_rows integer default 10)
returns table (
  chunk_id uuid,
  document_id uuid,
  evidence_id uuid,
  kind text,
  ord smallint,
  text text,
  metadata jsonb,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('russian'::regconfig, left(query, 500)) as tsq)
  select c.id, d.id, d.evidence_id, d.kind, c.ord, c.text, c.metadata, r.rank
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  cross join q
  cross join lateral (select pg_catalog.ts_rank(c.fts, q.tsq) as rank) r
  where d.hotel_id = hotel_chunks_search.hotel_id and c.fts operator(pg_catalog.@@) q.tsq
  order by r.rank desc, d.id, c.ord
  limit least(greatest(coalesce(max_rows, 10), 1), 50);
$$;

revoke all on function public.hotel_chunks_search(text, text, integer) from public;
grant execute on function public.hotel_chunks_search(text, text, integer) to anon, authenticated;
