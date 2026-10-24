-- Shared snapshots of the chats with Эвал: «Поделиться» saves the chat as it is now and gives the link
-- /assistant/shared/<id>, read-only to anyone who has it. Only a signed-in user shares, and only their own snapshot.
-- Anyone reads one snapshot by its id through `assistant_chat_share(id)`: the table itself is not listed to them.
-- The snapshot is a copy, so the chat goes on changing (or is deleted) without changing the link.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback: `drop function if exists public.assistant_chat_share(uuid); drop table if exists public.assistant_chat_shares;`
-- — the links stop opening; the chats themselves are untouched.

create table if not exists public.assistant_chat_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  -- The messages and the brief of the chat at the moment of sharing: src/lib/assistantShare.ts (`ShareSnapshot`).
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 1000000),
  created_at timestamptz not null default now()
);

create index if not exists assistant_chat_shares_user_id_idx on public.assistant_chat_shares (user_id, created_at desc);

alter table public.assistant_chat_shares enable row level security;

drop policy if exists "assistant_chat_shares_select_own" on public.assistant_chat_shares;
create policy "assistant_chat_shares_select_own" on public.assistant_chat_shares
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "assistant_chat_shares_insert_own" on public.assistant_chat_shares;
create policy "assistant_chat_shares_insert_own" on public.assistant_chat_shares
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_chat_shares_delete_own" on public.assistant_chat_shares;
create policy "assistant_chat_shares_delete_own" on public.assistant_chat_shares
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.assistant_chat_shares from anon;
grant select, insert, delete on public.assistant_chat_shares to authenticated;

-- One snapshot by its id, for anyone with the link; without the owner's id. An unknown id gives no row.
create or replace function public.assistant_chat_share(share_id uuid)
returns table (id uuid, title text, snapshot jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.snapshot, s.created_at
  from public.assistant_chat_shares s
  where s.id = share_id
$$;

revoke all on function public.assistant_chat_share(uuid) from public;
grant execute on function public.assistant_chat_share(uuid) to anon, authenticated;
