-- «Удалить» a chat with a hotelier on «Мои чаты»: the chat leaves the traveller's list, nothing is deleted. The hotelier
-- keeps the conversation, its messages and everything extracted from them (`hotelier_knowledge`, the claims), so a
-- traveller's tidying never takes an answer away from the hotel. The conversation is hidden from the traveller by
-- `user_hidden_at`; a new message of either side shows it again. The column is the traveller's side only: not selectable
-- by the browser (the hotelier never learns it was hidden), set by `hotelier_hide_chat`, cleared by a trigger. No policy
-- is loosened: the traveller still cannot update or delete a conversation.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback:
--   drop trigger if exists hotelier_messages_unhide on public.hotelier_messages;
--   drop function if exists public.hotelier_unhide_chat(), public.hotelier_hide_chat(uuid);
--   re-run `hotelier_my_chats` of 20261029140000_hotelier_my_chats.sql and `refresh_hotelier_column_grants` of
--   20261029130000_hotelier_column_grants_drop_chunks_search.sql;
--   alter table public.hotelier_conversations drop column if exists user_hidden_at;

alter table public.hotelier_conversations add column if not exists user_hidden_at timestamptz;

-- The hidden columns gain `user_hidden_at`; the rest is the function of 20261029130000.
create or replace function public.refresh_hotelier_column_grants()
returns void
language plpgsql
set search_path = ''
as $$
declare
  hidden jsonb := jsonb_build_object(
    'hotelier_conversations', array['user_id', 'origin_chat_id', 'origin_tool_run_id', 'user_hidden_at'],
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

revoke all on function public.refresh_hotelier_column_grants() from public, anon, authenticated;

select public.refresh_hotelier_column_grants();

-- «Мои чаты» without the chats the traveller hid.
create or replace function public.hotelier_my_chats()
returns setof public.hotelier_conversations
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.hotelier_conversations c
  where c.user_id = (select auth.uid()) and c.kind = 'user' and c.user_hidden_at is null
  order by c.last_message_at desc
  limit 200;
$$;

revoke all on function public.hotelier_my_chats() from public, anon;
grant execute on function public.hotelier_my_chats() to authenticated;

-- The signed-in traveller hides their own chat; false when there is none such (another's, an unknown id, Эвал's question).
create or replace function public.hotelier_hide_chat(conversation_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with hidden as (
    update public.hotelier_conversations c
    set user_hidden_at = now()
    where c.id = hotelier_hide_chat.conversation_id and c.user_id = (select auth.uid()) and c.kind = 'user'
    returning 1
  )
  select exists (select 1 from hidden);
$$;

revoke all on function public.hotelier_hide_chat(uuid) from public, anon;
grant execute on function public.hotelier_hide_chat(uuid) to authenticated;

-- A new message of either side shows the chat again.
create or replace function public.hotelier_unhide_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.hotelier_conversations c set user_hidden_at = null
  where c.id = new.conversation_id and c.user_hidden_at is not null;
  return new;
end;
$$;

revoke all on function public.hotelier_unhide_chat() from public, anon, authenticated;

drop trigger if exists hotelier_messages_unhide on public.hotelier_messages;
create trigger hotelier_messages_unhide after insert on public.hotelier_messages
  for each row execute function public.hotelier_unhide_chat();
