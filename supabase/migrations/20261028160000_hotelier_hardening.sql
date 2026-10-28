-- The hardening of the chats with the hoteliers (hotelier-chat-hardening):
-- 1. A question «from Эвал» comes only from the server's tool `ask_hotelier`, for a real run of it in `tool_runs` of
--    that traveller: `create_hotelier_request` is the service role's (the route calls it for the user its session
--    proved), never the browser's, and nobody inserts into `hotelier_requests` directly.
-- 2. The hotelier never gets the traveller's identity: the columns that name the traveller or their chats with Эвал
--    (`user_id`, `origin_chat_id`, `origin_tool_run_id`, a message's `author_id`) are not selectable by `authenticated`
--    — neither through the API nor through Realtime, which sends only the columns the subscriber may select. The
--    traveller reads their own chat with a hotel by `hotelier_traveller_chat`. A new column of these tables is not
--    selectable until it is granted here (the list of hidden columns below).
-- 3. The limits of messages (20 a minute of one author) and of requests (10 an hour, 3 open a hotel) are strict: the
--    author's writes queue behind a transaction-level advisory lock, so parallel inserts are counted one after another.
-- 4. The knowledge of a shareable answer is due (`knowledge_due_at`) from the moment it is written; the server takes it
--    for a lease, and a failed or interrupted extraction is due again later (src/lib/db/hotelierKnowledge.ts).
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (re-runs the functions and the grants of the earlier migrations):
--   drop function if exists public.create_hotelier_request(uuid, text, text, uuid, uuid, text[], text, text),
--     public.hotelier_traveller_chat(text), public.hotelier_own_answer(uuid);
--   drop index if exists public.hotelier_messages_knowledge_due_idx;
--   alter table public.hotelier_messages drop column if exists knowledge_due_at,
--     drop column if exists knowledge_attempts;
--   then re-run `create_hotelier_request` and its grants of 20261028140000_hotelier_knowledge.sql,
--   `hotelier_message_added` of 20261028150000_hotelier_demo.sql, the policy "hotelier_requests_insert_own" and
--   `grant select, insert on public.hotelier_conversations, public.hotelier_requests, public.hotelier_messages to
--   authenticated` of 20261028130000_hotelier_chat.sql.

-- The knowledge of a shareable answer: due from `knowledge_due_at` (null: nothing to do), tried `knowledge_attempts`
-- times. The server's columns: nobody else reads or writes them.
alter table public.hotelier_messages add column if not exists knowledge_due_at timestamptz;
alter table public.hotelier_messages add column if not exists knowledge_attempts smallint not null default 0;
create index if not exists hotelier_messages_knowledge_due_idx
  on public.hotelier_messages (knowledge_due_at) where knowledge_due_at is not null;

-- The answers whose knowledge is still waiting or failed, and the shareable ones that never got their source: due now.
update public.hotelier_messages m
set knowledge_due_at = now()
where m.sender = 'hotelier' and m.shareable and m.knowledge_revoked_at is null and m.knowledge_due_at is null
  and (
    exists (
      select 1 from public.hotelier_requests r
      where r.answer_message_id = m.id and r.knowledge_status in ('queued', 'failed')
    )
    or not exists (
      select 1 from public.evidence e where e.type = 'hotelier' and e.external_id = m.id::text
    )
  );

-- A new message: as in 20261028150000_hotelier_demo.sql, with the author's writes one after another (the advisory lock
-- of the transaction, taken before the conversation's row so the order is always the same) — so the count of the
-- last minute sees every earlier message of the author, however many arrive at once. A hotelier's shareable answer is
-- due for its knowledge; the knowledge columns are the server's, whatever the insert says.
create or replace function public.hotelier_message_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.hotelier_conversations;
begin
  if new.author_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('hotelier_messages:' || new.author_id::text, 0)
    );
  end if;
  select * into conversation from public.hotelier_conversations where id = new.conversation_id for update;
  if conversation.status = 'closed' then
    raise exception 'hotelier_conversation_closed' using errcode = 'P0001';
  end if;
  -- A message of the demo hotelier, or one the demo data marked, is demonstration: the conversation becomes one too.
  new.is_demo := new.is_demo or exists (
    select 1 from public.hotelier_profiles p where p.user_id = new.author_id and p.is_demo
  );
  if new.author_id is not null and (
    select count(*) from public.hotelier_messages m
    where m.author_id = new.author_id and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'hotelier_rate_limited' using errcode = 'P0001';
  end if;
  new.knowledge_attempts := 0;
  new.knowledge_due_at := case when new.sender = 'hotelier' and new.shareable then now() end;
  update public.hotelier_conversations c
  set
    last_message_at = new.created_at,
    last_message_text = left(regexp_replace(btrim(new.text), '\s+', ' ', 'g'), 200),
    last_sender = new.sender,
    is_demo = c.is_demo or new.is_demo,
    -- Эвал's question of an `ai_request` is the hotelier's to read; the assistant's answer of a chat, the traveller's.
    user_unread = c.user_unread + (new.sender = 'hotelier' or (new.sender = 'ai_assistant' and c.kind = 'user'))::int,
    hotelier_unread = c.hotelier_unread
      + (new.sender = 'user' or (new.sender = 'ai_assistant' and c.kind = 'ai_request'))::int,
    status = case
      when new.sender = 'user' and c.status = 'resolved' then 'open'
      when new.sender = 'hotelier' and c.status = 'waiting_hotelier' then 'open'
      else c.status
    end
  where c.id = new.conversation_id;
  return new;
end;
$$;

-- Эвал's question to the hotel's hotelier for `traveller`, by the server only (the service role): the route proved the
-- traveller by their session, and the question belongs to their chat with Эвал (`origin_chat_id`) and to the run of
-- `ask_hotelier` the route has just started there (`origin_tool_run_id`, `running`, not yet linked to a request). The
-- traveller's identical open question (the hotel, the words, the characteristics, the room) is the same request
-- (`reused`). At most 10 questions an hour and 3 open ones a hotel, counted one after another (the advisory lock).
-- Replaces the traveller's own call of 20261028140000_hotelier_knowledge.sql.
drop function if exists public.create_hotelier_request(text, text, text[], text, text, uuid, uuid, uuid);
create or replace function public.create_hotelier_request(
  traveller uuid,
  hotel_id text,
  question text,
  origin_chat_id uuid,
  origin_tool_run_id uuid,
  characteristic_keys text[] default '{}',
  room_ref text default null,
  context_summary text default null
)
returns table (request uuid, conversation uuid, reused boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  words text := btrim(regexp_replace(coalesce(create_hotelier_request.question, ''), '\s+', ' ', 'g'));
  keys text[] := (
    select coalesce(array_agg(distinct k order by k), '{}')
    from unnest(coalesce(create_hotelier_request.characteristic_keys, '{}')) k
    where k ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
  );
  key text;
  found_request public.hotelier_requests;
  chat uuid;
  room uuid;
  asked uuid;
begin
  if traveller is null or origin_chat_id is null or origin_tool_run_id is null then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hotelier_requests:' || traveller::text, 0));
  if char_length(words) not between 1 and 1000 or char_length(coalesce(context_summary, '')) > 1000
    or cardinality(keys) > 20 then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.hotels h where h.id = create_hotelier_request.hotel_id) then
    raise exception 'hotelier_request_invalid' using errcode = 'P0001';
  end if;
  -- The run of the tool, of this traveller's chat, started and not finished, linked to no request yet.
  perform 1 from public.tool_runs t
  where t.id = origin_tool_run_id and t.user_id = traveller and t.chat_id = origin_chat_id
    and t.tool_name = 'ask_hotelier' and t.status = 'running'
    and not exists (select 1 from public.hotelier_requests r where r.origin_tool_run_id = t.id)
  for update;
  if not found then raise exception 'hotelier_request_invalid' using errcode = 'P0001'; end if;

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
  where r.user_id = traveller and r.dedupe_key = key and r.status = 'pending';
  if found then
    return query select found_request.id, found_request.conversation_id, true;
    return;
  end if;

  if (
    select count(*) from public.hotelier_requests r
    where r.user_id = traveller and r.created_at > now() - interval '1 hour'
  ) >= 10
    or (
      select count(*) from public.hotelier_requests r
      where r.user_id = traveller and r.hotel_id = create_hotelier_request.hotel_id and r.status = 'pending'
    ) >= 3 then
    raise exception 'hotelier_request_limit' using errcode = 'P0001';
  end if;

  if room_ref is not null then
    select e.id into room from public.entities e
    where e.kind = 'room' and e.ref = room_ref and e.hotel_id = create_hotelier_request.hotel_id;
  end if;

  insert into public.hotelier_conversations (hotel_id, user_id, kind, status, origin_chat_id, origin_tool_run_id)
  values (create_hotelier_request.hotel_id, traveller, 'ai_request', 'waiting_hotelier', origin_chat_id,
    origin_tool_run_id)
  returning id into chat;

  insert into public.hotelier_requests (
    conversation_id, hotel_id, user_id, room_entity_id, question, characteristic_keys, context_summary, dedupe_key,
    origin_chat_id, origin_tool_run_id, expires_at
  )
  values (
    chat, create_hotelier_request.hotel_id, traveller, room, words, keys, nullif(btrim(context_summary), ''), key,
    origin_chat_id, origin_tool_run_id, now() + interval '14 days'
  )
  returning id into asked;

  -- The assistant's message asks it in the conversation; it is nobody's (no author), so no traveller's limit counts it.
  insert into public.hotelier_messages (conversation_id, sender, author_id, text, request_id)
  values (chat, 'ai_assistant', null, words, asked);

  return query select asked, chat, false;
end;
$$;

revoke all on function public.create_hotelier_request(uuid, text, text, uuid, uuid, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.create_hotelier_request(uuid, text, text, uuid, uuid, text[], text, text)
  to service_role;

-- A request is written by the definer functions and the server only.
drop policy if exists "hotelier_requests_insert_own" on public.hotelier_requests;
revoke insert on public.hotelier_requests from authenticated;

-- The columns `authenticated` may select: all but the traveller's identity, their chats with Эвал and the server's
-- columns. Revoked first (a table-wide grant would show every column), then granted column by column.
do $$
declare
  hidden jsonb := jsonb_build_object(
    'hotelier_conversations', array['user_id', 'origin_chat_id', 'origin_tool_run_id'],
    'hotelier_requests', array['user_id', 'origin_chat_id', 'origin_tool_run_id'],
    'hotelier_messages', array['author_id', 'knowledge_due_at', 'knowledge_attempts']
  );
  t text;
  columns text;
begin
  for t in select jsonb_object_keys(hidden) loop
    execute format('revoke select on public.%I from authenticated', t);
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into columns
    from pg_catalog.pg_attribute a
    where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped;
    execute format('revoke select (%s) on public.%I from authenticated', columns, t);
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into columns
    from pg_catalog.pg_attribute a
    where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped
      and not a.attname = any (array(select jsonb_array_elements_text(hidden -> t)));
    execute format('grant select (%s) on public.%I to authenticated', columns, t);
  end loop;
end $$;

-- The signed-in traveller's newest chat with the hotel (`kind = 'user'`), closed or not: a hotelier sees every chat of
-- the hotel, and the traveller may not filter by the hidden `user_id`. Their own row, whole. Definer, for that column.
create or replace function public.hotelier_traveller_chat(hotel_id text)
returns setof public.hotelier_conversations
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.hotelier_conversations c
  where c.user_id = (select auth.uid()) and c.hotel_id = hotelier_traveller_chat.hotel_id and c.kind = 'user'
  order by c.created_at desc
  limit 1;
$$;

-- The message is the signed-in hotelier's own answer in a conversation of their hotel: they may withdraw its
-- knowledge. Definer, for the hidden `author_id`.
create or replace function public.hotelier_own_answer(message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hotelier_messages m
    where m.id = hotelier_own_answer.message_id and m.sender = 'hotelier' and m.author_id = (select auth.uid())
      and public.is_hotelier_conversation(m.conversation_id)
  );
$$;

-- The conversation is the signed-in traveller's own. Definer: the policy below may not read the hidden `user_id`.
create or replace function public.is_traveller_conversation(conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hotelier_conversations c
    where c.id = is_traveller_conversation.conversation_id and c.user_id = (select auth.uid())
  );
$$;

-- A message as the traveller into their chat: as in 20261028130000_hotelier_chat.sql, its chat checked by the function.
drop policy if exists "hotelier_messages_insert_user" on public.hotelier_messages;
create policy "hotelier_messages_insert_user" on public.hotelier_messages
  for insert to authenticated
  with check (
    sender = 'user'
    and author_id = (select auth.uid())
    and data = '{}'::jsonb
    and request_id is null
    and not shareable
    and read_at is null
    and public.is_traveller_conversation(conversation_id)
  );

revoke all on function public.hotelier_traveller_chat(text), public.hotelier_own_answer(uuid),
  public.is_traveller_conversation(uuid) from public, anon;
grant execute on function public.hotelier_traveller_chat(text), public.hotelier_own_answer(uuid),
  public.is_traveller_conversation(uuid) to authenticated;
