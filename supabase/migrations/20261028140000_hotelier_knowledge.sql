-- The hotel's AI assistant between the traveller and the hotelier (hotelier-knowledge): Эвал's tool `ask_hotelier`
-- leaves a question for the hotelier and its run waits (`tool_runs.status = 'waiting'`) without holding a request;
-- the hotelier's answer finishes the run, tells the traveller's chat with Эвал and, when the hotelier allows it
-- (`shareable`), its impersonal characteristics become claims `reported` of the store with the answer as their
-- evidence, and a document of the hotel's knowledge for the search. The search of a hotel's documents is hybrid:
-- full text and the vectors of `nvidia/nemotron-3.5-embed-1b` fused by reciprocal rank (RRF). The demo data are
-- flagged (`is_demo`) on the claims and the evidence. Written by src/lib/ai/hotelierTool.ts (as the traveller),
-- src/app/api/hotelier (as the hotelier) and src/lib/db/hotelierKnowledge.ts (the server, after the answer).
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (the answers' claims and documents stay readable; `is_demo` and `knowledge_revoked_at` are dropped):
--   alter publication supabase_realtime drop table public.tool_runs, public.assistant_messages;
--   drop function if exists public.create_hotelier_request(text, text, text[], text, text, uuid, uuid, uuid),
--     public.answer_hotelier_request(uuid, uuid), public.hotel_chunks_hybrid(text, text, extensions.halfvec, integer);
--   alter table public.document_chunks drop column if exists content_hash;
--   alter table public.hotelier_messages drop column if exists knowledge_revoked_at;
--   alter table public.claims drop column if exists is_demo;
--   alter table public.evidence drop column if exists is_demo;
--   then restore the checks of `evidence.type` and `documents.kind` without `hotelier`/`hotelier_answer` (only after
--   deleting those rows).

-- A hotelier's answer is a source of its own; its document is the hotel's knowledge from it.
alter table public.evidence drop constraint if exists evidence_type_check;
alter table public.evidence add constraint evidence_type_check
  check (type in ('dataset', 'osm', 'review', 'ota_page', 'calculation', 'hotelier'));
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check check (kind in ('review', 'hotelier_answer'));

-- Synthetic demonstration data (the demo hotelier's answers): shown everywhere, always marked «демо».
alter table public.claims add column if not exists is_demo boolean not null default false;
alter table public.evidence add column if not exists is_demo boolean not null default false;

-- sha256 of the model, the dimensions and the text of the chunk's vector: an unchanged chunk is not embedded again.
alter table public.document_chunks add column if not exists content_hash text;

-- The hotelier withdrew the answer's characteristics: its claims end (`valid_to`), its document goes.
alter table public.hotelier_messages add column if not exists knowledge_revoked_at timestamptz;

-- The chunks of a hotel's documents for `query`: the full-text ranking (Russian stemmer, websearch syntax) and, with
-- `query_embedding`, the cosine ranking of the chunks that have a vector, each at most 50, fused by reciprocal rank
-- (k = 60): `rank` is Σ 1/(60 + place). Without a vector the full text alone. Runs as the caller: the chunks are public.
create or replace function public.hotel_chunks_hybrid(
  hotel_id text,
  query text,
  query_embedding extensions.halfvec(2048) default null,
  max_rows integer default 10
)
returns table (
  chunk_id uuid,
  document_id uuid,
  evidence_id uuid,
  kind text,
  ord smallint,
  text text,
  metadata jsonb,
  rank double precision,
  fts_place integer,
  vector_place integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select pg_catalog.websearch_to_tsquery('russian'::regconfig, left(coalesce(query, ''), 500)) as tsq),
  own as (
    select c.id, c.fts, c.embedding
    from public.document_chunks c
    join public.documents d on d.id = c.document_id
    where d.hotel_id = hotel_chunks_hybrid.hotel_id
  ),
  fts as (
    select o.id, row_number() over (order by pg_catalog.ts_rank(o.fts, q.tsq) desc, o.id)::integer as place
    from own o cross join q
    where o.fts operator(pg_catalog.@@) q.tsq
    order by place
    limit 50
  ),
  vec as (
    select o.id, row_number() over (order by o.embedding operator(extensions.<=>) query_embedding, o.id)::integer as place
    from own o
    where query_embedding is not null and o.embedding is not null
    order by place
    limit 50
  ),
  fused as (
    select coalesce(f.id, v.id) as id,
      coalesce(1.0 / (60 + f.place), 0) + coalesce(1.0 / (60 + v.place), 0) as score,
      f.place as fts_place,
      v.place as vector_place
    from fts f full join vec v on v.id = f.id
  )
  select c.id, d.id, d.evidence_id, d.kind, c.ord, c.text, c.metadata, f.score, f.fts_place, f.vector_place
  from fused f
  join public.document_chunks c on c.id = f.id
  join public.documents d on d.id = c.document_id
  order by f.score desc, c.id
  limit least(greatest(coalesce(max_rows, 10), 1), 50);
$$;

revoke all on function public.hotel_chunks_hybrid(text, text, extensions.halfvec, integer) from public;
grant execute on function public.hotel_chunks_hybrid(text, text, extensions.halfvec, integer)
  to anon, authenticated, service_role;

-- A question to the hotel's hotelier as the signed-in traveller: Эвал's (`origin_chat_id`, `origin_tool_run_id` — the
-- traveller's own) in a conversation `ai_request` of its own, or the hotel's AI assistant's in the traveller's chat
-- with the hotel (`conversation_id`). The traveller's identical open question (the hotel, the words, the
-- characteristics, the room) is the same request (`reused`). At most 10 questions an hour and 3 open ones a hotel.
-- Definer: the conversation `ai_request` and the assistant's message are not the traveller's to write.
create or replace function public.create_hotelier_request(
  hotel_id text,
  question text,
  characteristic_keys text[] default '{}',
  room_ref text default null,
  context_summary text default null,
  origin_chat_id uuid default null,
  origin_tool_run_id uuid default null,
  conversation_id uuid default null
)
returns table (request uuid, conversation uuid, reused boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  words text := btrim(regexp_replace(coalesce(create_hotelier_request.question, ''), '\s+', ' ', 'g'));
  keys text[] := (
    select coalesce(array_agg(distinct k order by k), '{}')
    from unnest(coalesce(create_hotelier_request.characteristic_keys, '{}')) k
    where k ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
  );
  key text;
  found_request public.hotelier_requests;
  chat uuid := create_hotelier_request.conversation_id;
  room uuid;
  asked uuid;
  message uuid;
begin
  if uid is null then raise exception 'hotelier_sign_in' using errcode = 'P0001'; end if;
  if char_length(words) not between 1 and 1000 or char_length(coalesce(context_summary, '')) > 1000
    or cardinality(keys) > 20 then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.hotels h where h.id = create_hotelier_request.hotel_id) then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  if origin_chat_id is not null and not exists (
    select 1 from public.assistant_chats a where a.id = origin_chat_id and a.user_id = uid
  ) then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  if origin_tool_run_id is not null and not exists (
    select 1 from public.tool_runs t where t.id = origin_tool_run_id and t.user_id = uid
  ) then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  if chat is not null and not exists (
    select 1 from public.hotelier_conversations c
    where c.id = chat and c.user_id = uid and c.hotel_id = create_hotelier_request.hotel_id
      and c.kind = 'user' and c.status <> 'closed'
  ) then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;

  key := encode(
    pg_catalog.sha256(
      convert_to(
        concat_ws(E'\n', create_hotelier_request.hotel_id, lower(words), array_to_string(keys, ','),
          coalesce(room_ref, '')),
        'UTF8'
      )
    ),
    'hex'
  );
  select * into found_request from public.hotelier_requests r
  where r.user_id = uid and r.dedupe_key = key and r.status = 'pending';
  if found then
    return query select found_request.id, found_request.conversation_id, true;
    return;
  end if;

  if (select count(*) from public.hotelier_requests r where r.user_id = uid and r.created_at > now() - interval '1 hour')
    >= 10
    or (
      select count(*) from public.hotelier_requests r
      where r.user_id = uid and r.hotel_id = create_hotelier_request.hotel_id and r.status = 'pending'
    ) >= 3 then
    raise exception 'hotelier_request_limit' using errcode = 'P0001';
  end if;

  if room_ref is not null then
    select e.id into room from public.entities e
    where e.kind = 'room' and e.ref = room_ref and e.hotel_id = create_hotelier_request.hotel_id;
  end if;

  if chat is null then
    insert into public.hotelier_conversations (hotel_id, user_id, kind, status, origin_chat_id, origin_tool_run_id)
    values (create_hotelier_request.hotel_id, uid, 'ai_request', 'waiting_hotelier', origin_chat_id, origin_tool_run_id)
    returning id into chat;
  else
    update public.hotelier_conversations c set status = 'waiting_hotelier' where c.id = chat;
  end if;

  insert into public.hotelier_requests (
    conversation_id, hotel_id, user_id, room_entity_id, question, characteristic_keys, context_summary, dedupe_key,
    origin_chat_id, origin_tool_run_id, expires_at
  )
  values (
    chat, create_hotelier_request.hotel_id, uid, room, words, keys, nullif(btrim(context_summary), ''), key,
    origin_chat_id, origin_tool_run_id, now() + interval '14 days'
  )
  returning id into asked;

  -- The assistant's message asks it in the conversation; it is nobody's (no author), so no traveller's limit counts it.
  insert into public.hotelier_messages (conversation_id, sender, author_id, text, request_id)
  values (chat, 'ai_assistant', null, words, asked)
  returning id into message;

  return query select asked, chat, false;
end;
$$;

-- The hotelier's answer (`message_id`, theirs, already in the conversation) to a request of their hotel: the request is
-- answered; each run of Эвал waiting for it ends `success` with the answer, in `tool_runs` and in the step of the
-- chat's message that shows it; the chat gets the hotelier's message (`owner`) and is unread. The characteristics of a
-- shared answer are queued for the server (`knowledge_status = 'queued'`). Returns the runs finished; nothing for a
-- request already answered or not the caller's hotel's.
create or replace function public.answer_hotelier_request(request_id uuid, message_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.hotelier_requests;
  m public.hotelier_messages;
  run public.tool_runs;
  result jsonb;
  summary text;
  limitation text;
begin
  select * into r from public.hotelier_requests q where q.id = answer_hotelier_request.request_id for update;
  if not found or r.status <> 'pending' or not public.is_hotelier_of(r.hotel_id) then return; end if;
  select * into m from public.hotelier_messages x
  where x.id = answer_hotelier_request.message_id and x.conversation_id = r.conversation_id and x.sender = 'hotelier';
  if not found then return; end if;

  update public.hotelier_requests q
  set status = 'answered', answered_at = now(), answer_message_id = m.id,
    knowledge_status = case when m.shareable then 'queued' else 'done' end
  where q.id = r.id;
  update public.hotelier_messages x set request_id = r.id where x.id = m.id and x.request_id is null;

  summary := left('Отельер ответил: ' || regexp_replace(btrim(m.text), '\s+', ' ', 'g'), 1000);
  limitation := case
    when m.shareable then 'Характеристики из ответа извлекаются и появятся в этом блоке'
    else 'Отельер ответил лично: ответ не попадает в общие сведения об отеле'
  end;
  result := jsonb_build_object(
    'status', 'success',
    'summary', summary,
    'data', jsonb_build_object(
      'request_id', r.id,
      'hotel_id', r.hotel_id,
      'hotel_name', (select h.data ->> 'name' from public.hotels h where h.id = r.hotel_id),
      'request_status', 'answered',
      'question', r.question,
      'requested_characteristics', to_jsonb(r.characteristic_keys),
      'answer', left(m.text, 4000),
      'answered_at', now(),
      'knowledge', case when m.shareable then 'queued' else 'none' end
    ),
    'evidence', '[]'::jsonb,
    'claims', '[]'::jsonb,
    'calculations', '[]'::jsonb,
    'method', null,
    'limitations', jsonb_build_array(limitation),
    'error', null
  );

  for run in
    select * from public.tool_runs t
    where t.user_id = r.user_id and t.status = 'waiting' and t.resume ->> 'request_id' = r.id::text
    for update
  loop
    update public.tool_runs t
    set status = 'success', result_summary = left(summary, 4000), result_data = result, resume = null,
      completed_at = greatest(now(), t.started_at)
    where t.id = run.id;
    update public.assistant_messages a
    set data = jsonb_set(jsonb_set(a.data, '{step,run,result}', result), '{step,result}', to_jsonb(left(summary, 300))),
      updated_at = now()
    where a.chat_id = run.chat_id and a.user_id = r.user_id and a.data -> 'step' -> 'run' ->> 'id' = run.id::text;
    insert into public.assistant_messages (id, chat_id, user_id, role, status, text, data)
    values (gen_random_uuid(), run.chat_id, r.user_id, 'owner', 'done', left(m.text, 4000),
      jsonb_build_object('hotelierRequest', r.id));
    update public.assistant_chats a set unread = true, updated_at = now() where a.id = run.chat_id;
    return next run.id;
  end loop;
end;
$$;

revoke all on function public.create_hotelier_request(text, text, text[], text, text, uuid, uuid, uuid),
  public.answer_hotelier_request(uuid, uuid) from public, anon;
grant execute on function public.create_hotelier_request(text, text, text[], text, text, uuid, uuid, uuid),
  public.answer_hotelier_request(uuid, uuid) to authenticated;

-- The traveller's chat with Эвал follows the runs and the messages the answer changes, by Realtime (RLS: their own).
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['tool_runs', 'assistant_messages'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
