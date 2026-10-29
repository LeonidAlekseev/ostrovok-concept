-- The «Отельер» tab of a hotel page shows the traveller's newest chat with the hotel, and showed it even after the
-- traveller hid it on «Мои чаты» (`user_hidden_at`, 20261029150000_hotelier_chat_hide.sql). A hidden chat now reads as
-- no chat: the tab is empty, and the traveller's next message goes into the same conversation (`openChat` finds the open
-- one) and shows it again (`hotelier_messages_unhide`). The newest chat decides: an older closed one does not come back
-- from behind a hidden newer one.
-- Idempotent. Rollback: re-run `hotelier_traveller_chat` of 20261028160000_hotelier_hardening.sql.

create or replace function public.hotelier_traveller_chat(hotel_id text)
returns setof public.hotelier_conversations
language sql
stable
security definer
set search_path = ''
as $$
  select newest.* from (
    select c.* from public.hotelier_conversations c
    where c.user_id = (select auth.uid()) and c.hotel_id = hotelier_traveller_chat.hotel_id and c.kind = 'user'
    order by c.created_at desc
    limit 1
  ) newest
  where newest.user_hidden_at is null;
$$;
