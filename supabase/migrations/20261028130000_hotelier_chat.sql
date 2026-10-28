-- The chats with the hotels' owners (hotel-chat): a traveller writes to a hotel, its hotelier answers in person, and
-- Эвал's questions to the hotelier («Запрос отельеру») are conversations of their own. The hoteliers are the users with
-- a profile here; a hotelier works for the hotels of `hotelier_hotel_access`, or for all of them (`all_hotels`, the
-- demo hotelier) — one right checked by the database (`is_hotelier_of`), not a row per hotel. The guest's name and
-- email are never in these tables: the hotelier sees «Гость». The messages are untrusted text: data to quote, never
-- instructions. Read and written by src/lib/hotelierChat.ts and the routes of src/app/api/hotels/[hotelId]/hotelier
-- and src/app/api/hotelier; the browser follows them by Supabase Realtime.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (the conversations are lost: `\copy` them first; nothing else reads them):
--   alter publication supabase_realtime drop table public.hotelier_requests, public.hotelier_messages,
--     public.hotelier_conversations;
--   drop function if exists public.hotelier_conversation_read(uuid), public.hotelier_conversation_status(uuid, text),
--     public.hotelier_message_added(), public.hotelier_touch_updated_at(), public.is_hotelier(),
--     public.is_hotelier_of(text), public.is_hotelier_conversation(uuid);
--   drop table if exists public.hotelier_messages, public.hotelier_requests, public.hotelier_conversations,
--     public.hotelier_hotel_access, public.hotelier_profiles;

-- A hotelier: written by the service role only (`npm run db:hotelier`), so nobody makes themselves one.
create table if not exists public.hotelier_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Отельер' check (char_length(display_name) between 1 and 100),
  -- The shared demo account: its answers are demonstration ones.
  is_demo boolean not null default false,
  -- Works for every hotel: the demo hotelier.
  all_hotels boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The hotels of a hotelier who does not work for all of them (none yet: the model for several hoteliers).
create table if not exists public.hotelier_hotel_access (
  user_id uuid not null references public.hotelier_profiles (user_id) on delete cascade,
  hotel_id text not null references public.hotels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, hotel_id)
);

create index if not exists hotelier_hotel_access_hotel_id_idx on public.hotelier_hotel_access (hotel_id);

-- The signed-in user is a hotelier of `hotel_id`. Definer: the policies below call it, and a user reads no profiles
-- but their own.
create or replace function public.is_hotelier_of(hotel_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hotelier_profiles p
    where p.user_id = (select auth.uid())
      and (
        p.all_hotels
        or exists (
          select 1 from public.hotelier_hotel_access a
          where a.user_id = p.user_id and a.hotel_id = is_hotelier_of.hotel_id
        )
      )
  );
$$;

-- The signed-in user is a hotelier at all: the panel /hotelier opens for them.
create or replace function public.is_hotelier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hotelier_profiles p where p.user_id = (select auth.uid()));
$$;

-- A conversation with a hotel: a traveller's (`user`) or Эвал's question on a traveller's behalf (`ai_request`, with
-- the chat and the run of the tool it came from). `user_id` is the traveller in both. `waiting_hotelier`: the question
-- waits for a person; `resolved` and `closed` are set by the hotelier (a traveller may close their own).
create table if not exists public.hotelier_conversations (
  id uuid primary key default gen_random_uuid(),
  hotel_id text not null references public.hotels (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'user' check (kind in ('user', 'ai_request')),
  status text not null default 'open' check (status in ('open', 'waiting_hotelier', 'resolved', 'closed')),
  origin_chat_id uuid,
  origin_tool_run_id uuid,
  -- The newest message, for the lists: its time and its first words.
  last_message_at timestamptz not null default now(),
  last_message_text text not null default '' check (char_length(last_message_text) <= 200),
  last_sender text check (last_sender in ('user', 'hotelier', 'ai_assistant')),
  -- The messages each side has not read yet.
  user_unread integer not null default 0 check (user_unread >= 0),
  hotelier_unread integer not null default 0 check (hotelier_unread >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (origin_chat_id, user_id) references public.assistant_chats (id, user_id)
    on delete set null (origin_chat_id),
  foreign key (origin_tool_run_id, user_id) references public.tool_runs (id, user_id)
    on delete set null (origin_tool_run_id),
  check (kind = 'ai_request' or (origin_chat_id is null and origin_tool_run_id is null))
);

create index if not exists hotelier_conversations_hotel_idx
  on public.hotelier_conversations (hotel_id, last_message_at desc);
create index if not exists hotelier_conversations_user_idx
  on public.hotelier_conversations (user_id, hotel_id, last_message_at desc);
create index if not exists hotelier_conversations_status_idx
  on public.hotelier_conversations (status, last_message_at desc);
create index if not exists hotelier_conversations_origin_chat_idx
  on public.hotelier_conversations (origin_chat_id) where origin_chat_id is not null;
-- One open chat of a traveller with a hotel: a new one starts after the hotelier closed it.
create unique index if not exists hotelier_conversations_user_open_idx
  on public.hotelier_conversations (user_id, hotel_id) where kind = 'user' and status <> 'closed';

-- A question to the hotelier: what is asked (the characteristics, the room), its state and the answer. `dedupe_key`
-- is the hash of the hotel, the question, the characteristics and the room: a traveller's identical open question is
-- one request. `knowledge_status`: the answer's characteristics and its knowledge for the search (hotelier-knowledge).
create table if not exists public.hotelier_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  hotel_id text not null references public.hotels (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_entity_id uuid references public.entities (id) on delete set null,
  question text not null check (char_length(question) between 1 and 1000),
  characteristic_keys text[] not null default '{}' check (cardinality(characteristic_keys) <= 20),
  context_summary text check (char_length(context_summary) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'answered', 'cancelled', 'expired')),
  dedupe_key text not null check (dedupe_key ~ '^[0-9a-f]{64}$'),
  origin_chat_id uuid,
  origin_tool_run_id uuid,
  answer_message_id uuid,
  knowledge_status text not null default 'none' check (knowledge_status in ('none', 'queued', 'done', 'failed')),
  answered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.hotelier_conversations (id, user_id) on delete cascade,
  foreign key (origin_chat_id, user_id) references public.assistant_chats (id, user_id)
    on delete set null (origin_chat_id),
  foreign key (origin_tool_run_id, user_id) references public.tool_runs (id, user_id)
    on delete set null (origin_tool_run_id),
  check ((status = 'answered') = (answered_at is not null))
);

create index if not exists hotelier_requests_hotel_idx on public.hotelier_requests (hotel_id, status, created_at desc);
create index if not exists hotelier_requests_user_idx on public.hotelier_requests (user_id, status, created_at desc);
create index if not exists hotelier_requests_conversation_idx on public.hotelier_requests (conversation_id);
create unique index if not exists hotelier_requests_pending_idx
  on public.hotelier_requests (user_id, dedupe_key) where status = 'pending';

-- A message of a conversation: the traveller's, the hotelier's or the hotel's AI assistant's (written by the server
-- only). `shareable`: the hotelier lets the answer's characteristics, impersonal, go to the hotel's common knowledge.
create table if not exists public.hotelier_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.hotelier_conversations (id) on delete cascade,
  sender text not null check (sender in ('user', 'hotelier', 'ai_assistant')),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  text text not null check (char_length(text) between 1 and 4000 and btrim(text) <> ''),
  -- The AI assistant's sources and the run of its tool (src/lib/toolResult.ts); empty for a person's message.
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 100000),
  request_id uuid references public.hotelier_requests (id) on delete set null,
  shareable boolean not null default false,
  -- When the other side read it.
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender <> 'user' or not shareable)
);

create index if not exists hotelier_messages_conversation_idx
  on public.hotelier_messages (conversation_id, created_at);
create index if not exists hotelier_messages_author_idx on public.hotelier_messages (author_id, created_at desc);
create index if not exists hotelier_messages_request_idx
  on public.hotelier_messages (request_id) where request_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hotelier_requests_answer_message_id_fkey') then
    alter table public.hotelier_requests
      add constraint hotelier_requests_answer_message_id_fkey
      foreign key (answer_message_id) references public.hotelier_messages (id) on delete set null;
  end if;
end $$;

-- The user may read the conversation: its traveller, or a hotelier of its hotel. Definer, for the policies of the
-- messages.
create or replace function public.is_hotelier_conversation(conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hotelier_conversations c
    where c.id = is_hotelier_conversation.conversation_id
      and (c.user_id = (select auth.uid()) or public.is_hotelier_of(c.hotel_id))
  );
$$;

create or replace function public.hotelier_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hotelier_profiles_touch on public.hotelier_profiles;
create trigger hotelier_profiles_touch before update on public.hotelier_profiles
  for each row execute function public.hotelier_touch_updated_at();
drop trigger if exists hotelier_conversations_touch on public.hotelier_conversations;
create trigger hotelier_conversations_touch before update on public.hotelier_conversations
  for each row execute function public.hotelier_touch_updated_at();
drop trigger if exists hotelier_requests_touch on public.hotelier_requests;
create trigger hotelier_requests_touch before update on public.hotelier_requests
  for each row execute function public.hotelier_touch_updated_at();

-- A new message: at most 20 a minute of one author (whatever writes it: the routes or the API itself), never into a
-- closed conversation; then the conversation's newest message, the other side's unread count and its state — the
-- traveller's message reopens a resolved chat, the hotelier's answer ends the wait. Definer: the author may not
-- update the conversation themselves.
create or replace function public.hotelier_message_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.hotelier_conversations;
begin
  select * into conversation from public.hotelier_conversations where id = new.conversation_id for update;
  if conversation.status = 'closed' then
    raise exception 'hotelier_conversation_closed' using errcode = 'P0001';
  end if;
  if new.author_id is not null and (
    select count(*) from public.hotelier_messages m
    where m.author_id = new.author_id and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'hotelier_rate_limited' using errcode = 'P0001';
  end if;
  update public.hotelier_conversations c
  set
    last_message_at = new.created_at,
    last_message_text = left(regexp_replace(btrim(new.text), '\s+', ' ', 'g'), 200),
    last_sender = new.sender,
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

drop trigger if exists hotelier_messages_added on public.hotelier_messages;
create trigger hotelier_messages_added before insert on public.hotelier_messages
  for each row execute function public.hotelier_message_added();

-- The caller has read the conversation: the traveller the messages of the others, the hotelier the traveller's and
-- Эвал's. Nothing for anyone else.
create or replace function public.hotelier_conversation_read(conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.hotelier_conversations;
begin
  select * into conversation from public.hotelier_conversations c where c.id = hotelier_conversation_read.conversation_id;
  if not found then return; end if;
  if conversation.user_id = (select auth.uid()) then
    update public.hotelier_messages m set read_at = now()
    where m.conversation_id = conversation.id and m.sender <> 'user' and m.read_at is null;
    update public.hotelier_conversations c set user_unread = 0 where c.id = conversation.id and c.user_unread <> 0;
  elsif public.is_hotelier_of(conversation.hotel_id) then
    update public.hotelier_messages m set read_at = now()
    where m.conversation_id = conversation.id and m.sender <> 'hotelier' and m.read_at is null;
    update public.hotelier_conversations c set hotelier_unread = 0
    where c.id = conversation.id and c.hotelier_unread <> 0;
  end if;
end;
$$;

-- A new state of the conversation: the hotelier's (`open`, `resolved`, `closed`) or the traveller's (`closed`). Closing
-- cancels its open requests. `false` when the caller may not.
create or replace function public.hotelier_conversation_status(conversation_id uuid, status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.hotelier_conversations;
begin
  select * into conversation from public.hotelier_conversations c
  where c.id = hotelier_conversation_status.conversation_id for update;
  if not found then return false; end if;
  if not (
    (public.is_hotelier_of(conversation.hotel_id) and status in ('open', 'resolved', 'closed'))
    or (conversation.user_id = (select auth.uid()) and status = 'closed')
  ) then
    return false;
  end if;
  update public.hotelier_conversations c set status = hotelier_conversation_status.status where c.id = conversation.id;
  if status = 'closed' then
    update public.hotelier_requests r set status = 'cancelled'
    where r.conversation_id = conversation.id and r.status = 'pending';
  end if;
  return true;
end;
$$;

alter table public.hotelier_profiles enable row level security;
alter table public.hotelier_hotel_access enable row level security;
alter table public.hotelier_conversations enable row level security;
alter table public.hotelier_requests enable row level security;
alter table public.hotelier_messages enable row level security;

-- A hotelier reads their own profile and hotels; nobody writes them but the service role.
drop policy if exists "hotelier_profiles_select_own" on public.hotelier_profiles;
create policy "hotelier_profiles_select_own" on public.hotelier_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "hotelier_hotel_access_select_own" on public.hotelier_hotel_access;
create policy "hotelier_hotel_access_select_own" on public.hotelier_hotel_access
  for select to authenticated using ((select auth.uid()) = user_id);

-- The traveller reads their conversations and starts a chat of their own; the hotelier reads those of their hotels.
-- The states and the counts change by the functions above only.
drop policy if exists "hotelier_conversations_select" on public.hotelier_conversations;
create policy "hotelier_conversations_select" on public.hotelier_conversations
  for select to authenticated using ((select auth.uid()) = user_id or public.is_hotelier_of(hotel_id));
drop policy if exists "hotelier_conversations_insert_own" on public.hotelier_conversations;
create policy "hotelier_conversations_insert_own" on public.hotelier_conversations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and kind = 'user'
    and status = 'open'
    and user_unread = 0
    and hotelier_unread = 0
    and last_message_text = ''
  );

-- The requests: the traveller's and their hotel's hotelier's to read; Эвал's route writes them as the traveller.
drop policy if exists "hotelier_requests_select" on public.hotelier_requests;
create policy "hotelier_requests_select" on public.hotelier_requests
  for select to authenticated using ((select auth.uid()) = user_id or public.is_hotelier_of(hotel_id));
drop policy if exists "hotelier_requests_insert_own" on public.hotelier_requests;
create policy "hotelier_requests_insert_own" on public.hotelier_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and answered_at is null
    and answer_message_id is null
    and knowledge_status = 'none'
  );

-- A message as the traveller into their chat, or as the hotelier into a chat of their hotel; the AI assistant's are
-- the server's. Nobody edits or deletes a message.
drop policy if exists "hotelier_messages_select" on public.hotelier_messages;
create policy "hotelier_messages_select" on public.hotelier_messages
  for select to authenticated using (public.is_hotelier_conversation(conversation_id));
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
    and exists (
      select 1 from public.hotelier_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
drop policy if exists "hotelier_messages_insert_hotelier" on public.hotelier_messages;
create policy "hotelier_messages_insert_hotelier" on public.hotelier_messages
  for insert to authenticated
  with check (
    sender = 'hotelier'
    and author_id = (select auth.uid())
    and data = '{}'::jsonb
    and read_at is null
    and exists (
      select 1 from public.hotelier_conversations c
      where c.id = conversation_id and public.is_hotelier_of(c.hotel_id)
    )
    and (
      request_id is null
      or exists (
        select 1 from public.hotelier_requests r
        where r.id = request_id and r.conversation_id = hotelier_messages.conversation_id
      )
    )
  );

revoke all on public.hotelier_profiles, public.hotelier_hotel_access, public.hotelier_conversations,
  public.hotelier_requests, public.hotelier_messages from anon, authenticated;
grant select on public.hotelier_profiles, public.hotelier_hotel_access to authenticated;
grant select, insert on public.hotelier_conversations, public.hotelier_requests, public.hotelier_messages
  to authenticated;

revoke all on function public.is_hotelier_of(text), public.is_hotelier(), public.is_hotelier_conversation(uuid),
  public.hotelier_conversation_read(uuid), public.hotelier_conversation_status(uuid, text) from public, anon;
revoke all on function public.hotelier_message_added(), public.hotelier_touch_updated_at()
  from public, anon, authenticated;
grant execute on function public.is_hotelier_of(text), public.is_hotelier(), public.is_hotelier_conversation(uuid),
  public.hotelier_conversation_read(uuid), public.hotelier_conversation_status(uuid, text) to authenticated;

-- The browser follows the conversations, the messages and the requests by Realtime: each subscriber gets only the rows
-- their policies show.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['hotelier_conversations', 'hotelier_messages', 'hotelier_requests'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
