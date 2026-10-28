-- «Мои чаты»: the signed-in traveller's own chats with the hotels' hoteliers (`kind = 'user'`), newest first. A hotelier
-- reads every chat of their hotels, and `user_id` is hidden, so the traveller's own are the database's to find. Definer,
-- for that column; the caller's id comes from the session, never from an argument.
--
-- Rollback: drop function if exists public.hotelier_my_chats();
create or replace function public.hotelier_my_chats()
returns setof public.hotelier_conversations
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.hotelier_conversations c
  where c.user_id = (select auth.uid()) and c.kind = 'user'
  order by c.last_message_at desc
  limit 200;
$$;

revoke all on function public.hotelier_my_chats() from public, anon;
grant execute on function public.hotelier_my_chats() to authenticated;
