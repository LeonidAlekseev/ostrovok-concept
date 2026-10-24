-- The chats with Эвал of the signed-in users (a guest keeps them in the browser and brings them on sign-in).
-- A message has a role, a status and structured data, so the steps of agents and, later, a hotel owner's
-- answers live in the same feed: src/lib/assistantChats.ts. Only the owner reads and writes their chats.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback: `drop table if exists public.assistant_messages, public.assistant_chats;` — the chats are lost
-- (take `\copy` of both tables first); the site then keeps the chats of everyone in the browser only.

create table if not exists public.assistant_chats (
  -- Made by the browser, so a guest's chat keeps its id when it moves to the account.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  -- What Эвал has understood (`Brief`) and the question it asked last (`Question`).
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object'),
  question jsonb check (question is null or jsonb_typeof(question) = 'object'),
  -- An answer came while the user was in another chat.
  unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists assistant_chats_user_id_idx on public.assistant_chats (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key,
  chat_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- `agent` is a step of one of Эвал's agents; `owner` is a hotel owner's answer (not written yet).
  role text not null check (role in ('user', 'assistant', 'agent', 'owner')),
  -- A pending message is finished later, maybe after a reload or from another chat.
  status text not null default 'done' check (status in ('pending', 'done', 'failed')),
  text text not null default '' check (char_length(text) <= 4000),
  -- The plan with its hotels, the step of an agent: src/lib/assistantChats.ts (`MessageData`).
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A message belongs to a chat of the same user.
  foreign key (chat_id, user_id) references public.assistant_chats (id, user_id) on delete cascade
);

create index if not exists assistant_messages_chat_id_idx on public.assistant_messages (chat_id, created_at);
create index if not exists assistant_messages_user_id_idx on public.assistant_messages (user_id);

alter table public.assistant_chats enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "assistant_chats_select_own" on public.assistant_chats;
create policy "assistant_chats_select_own" on public.assistant_chats
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "assistant_chats_insert_own" on public.assistant_chats;
create policy "assistant_chats_insert_own" on public.assistant_chats
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_chats_update_own" on public.assistant_chats;
create policy "assistant_chats_update_own" on public.assistant_chats
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_chats_delete_own" on public.assistant_chats;
create policy "assistant_chats_delete_own" on public.assistant_chats
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "assistant_messages_select_own" on public.assistant_messages;
create policy "assistant_messages_select_own" on public.assistant_messages
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "assistant_messages_insert_own" on public.assistant_messages;
create policy "assistant_messages_insert_own" on public.assistant_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_messages_update_own" on public.assistant_messages;
create policy "assistant_messages_update_own" on public.assistant_messages
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_messages_delete_own" on public.assistant_messages;
create policy "assistant_messages_delete_own" on public.assistant_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.assistant_chats, public.assistant_messages from anon;
grant select, insert, update, delete on public.assistant_chats, public.assistant_messages to authenticated;
