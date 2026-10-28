-- RLS of the chats with the hoteliers: a traveller sees and writes only their own conversations, and only as
-- themselves; a hotelier sees the conversations of their hotels only (the demo one, of all) and writes only as the
-- hotelier; a guest has none; the assistant's messages are the server's; the states change by the functions only.
-- Everything is rolled back. Run against the database (the transaction pooler: only `set local`):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hotelier_chat_rls.sql
-- A failed check raises an exception and psql stops with it; success prints «hotelier chat RLS: ok».

begin;

-- Travellers A and B; the hotelier H of every hotel (the demo one) and H2 of the second hotel only.
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'rls-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'rls-b@example.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'rls-h@example.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'rls-h2@example.test');
insert into public.hotelier_profiles (user_id, is_demo, all_hotels)
values ('00000000-0000-4000-8000-0000000000e1', true, true), ('00000000-0000-4000-8000-0000000000e2', false, false);

create temporary table rls_hotels on commit drop as
select id, row_number() over (order by id) as n from (select id from public.hotels order by id limit 2) h;
grant select on rls_hotels to authenticated, anon;
insert into public.hotelier_hotel_access (user_id, hotel_id)
select '00000000-0000-4000-8000-0000000000e2', id from rls_hotels where n = 2;

-- A opens a chat with the first hotel and writes.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

insert into public.hotelier_conversations (id, hotel_id)
select '00000000-0000-4000-8000-00000000cc01', id from rls_hotels where n = 1;
insert into public.hotelier_messages (conversation_id, sender, text)
values ('00000000-0000-4000-8000-00000000cc01', 'user', '  Есть ли   балкон в номере Deluxe?  ');

do $$
declare
  c public.hotelier_conversations;
begin
  -- A's own chat with the hotel, whole: by the function, as the traveller may not filter by the hidden `user_id`.
  select * into c from public.hotelier_traveller_chat((select id from rls_hotels where n = 1));
  if c.id is distinct from '00000000-0000-4000-8000-00000000cc01'
    or c.user_id is distinct from '00000000-0000-4000-8000-0000000000a1' then
    raise exception 'A does not find their own chat';
  end if;
  if c.hotelier_unread <> 1 or c.user_unread <> 0 then raise exception 'the unread counts are wrong'; end if;
  if c.last_message_text <> 'Есть ли балкон в номере Deluxe?' or c.last_sender <> 'user' then
    raise exception 'the newest message is wrong: %', c.last_message_text;
  end if;
  if public.is_hotelier() then raise exception 'A is a hotelier'; end if;
end $$;

-- A writes neither as the hotelier nor as the assistant, starts no request conversation, and makes no hotelier.
do $$
begin
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'hotelier', 'Да, есть');
    raise exception 'A wrote as the hotelier';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'ai_assistant', 'Да, есть');
    raise exception 'A wrote as the assistant';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text, author_id)
    values ('00000000-0000-4000-8000-00000000cc01', 'user', 'от B', '00000000-0000-4000-8000-0000000000b2');
    raise exception 'A wrote as B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hotelier_conversations (hotel_id, kind) select id, 'ai_request' from rls_hotels where n = 2;
    raise exception 'A started a request conversation';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.hotelier_profiles (user_id, all_hotels) values ('00000000-0000-4000-8000-0000000000a1', true);
    raise exception 'A made themselves a hotelier';
  exception when insufficient_privilege then null;
  end;
  if public.hotelier_conversation_status('00000000-0000-4000-8000-00000000cc01', 'resolved') then
    raise exception 'A resolved their own chat';
  end if;
end $$;

-- B sees nothing of A's and writes nothing into it.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
do $$
begin
  if (select count(*) from public.hotelier_conversations) <> 0 then raise exception 'B sees A''s conversation'; end if;
  if (select count(*) from public.hotelier_messages) <> 0 then raise exception 'B sees A''s messages'; end if;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'user', 'Чужой чат');
    raise exception 'B wrote into A''s chat';
  exception when insufficient_privilege then null;
  end;
  perform public.hotelier_conversation_read('00000000-0000-4000-8000-00000000cc01');
  if public.hotelier_conversation_status('00000000-0000-4000-8000-00000000cc01', 'closed') then
    raise exception 'B closed A''s chat';
  end if;
end $$;

-- H2 works for the second hotel only: A's chat is not theirs.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e2", "role": "authenticated"}';
do $$
begin
  if not public.is_hotelier() then raise exception 'H2 is not a hotelier'; end if;
  -- The demo data of the live database have chats of their own: only the test's are counted.
  if (select count(*) from public.hotelier_conversations where id = '00000000-0000-4000-8000-00000000cc01') <> 0 then
    raise exception 'H2 sees another hotel''s chat';
  end if;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'hotelier', 'Не мой отель');
    raise exception 'H2 answered for another hotel';
  exception when insufficient_privilege then null;
  end;
end $$;

-- H, the hotelier of all hotels, reads A's chat, answers as the hotelier only, reads it and resolves it.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
do $$
declare
  c record;
  hidden text;
begin
  if (select count(*) from public.hotelier_messages where conversation_id = '00000000-0000-4000-8000-00000000cc01') <> 1 then
    raise exception 'H does not see A''s message';
  end if;
  -- H never gets who the traveller is: not the id, not their chats with Эвал, not the author of their message.
  foreach hidden in array array[
    'select user_id from public.hotelier_conversations',
    'select origin_chat_id from public.hotelier_conversations',
    'select origin_tool_run_id from public.hotelier_conversations',
    'select * from public.hotelier_conversations',
    'select user_id from public.hotelier_requests',
    'select origin_tool_run_id from public.hotelier_requests',
    'select author_id from public.hotelier_messages',
    'select * from public.hotelier_messages'
  ] loop
    begin
      execute hidden;
      raise exception 'H read: %', hidden;
    exception when insufficient_privilege then null;
    end;
  end loop;
  if exists (select 1 from public.hotelier_traveller_chat((select id from rls_hotels where n = 1))) then
    raise exception 'H found A''s chat as their own';
  end if;
  if public.hotelier_own_answer((
    select id from public.hotelier_messages
    where sender = 'user' and conversation_id = '00000000-0000-4000-8000-00000000cc01'
  )) then
    raise exception 'A''s message is H''s answer';
  end if;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'user', 'Как гость');
    raise exception 'H wrote as the traveller';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'ai_assistant', 'Как AI');
    raise exception 'H wrote as the assistant';
  exception when insufficient_privilege then null;
  end;
  insert into public.hotelier_messages (conversation_id, sender, text, shareable)
  values ('00000000-0000-4000-8000-00000000cc01', 'hotelier', 'Да, у Deluxe балкон на 4–5 этажах', true);
  perform public.hotelier_conversation_read('00000000-0000-4000-8000-00000000cc01');
  if not public.hotelier_conversation_status('00000000-0000-4000-8000-00000000cc01', 'resolved') then
    raise exception 'H did not resolve the chat';
  end if;
  if not public.hotelier_own_answer((
    select id from public.hotelier_messages
    where sender = 'hotelier' and conversation_id = '00000000-0000-4000-8000-00000000cc01'
  )) then
    raise exception 'H''s answer is not theirs';
  end if;
  select hotelier_unread, user_unread, status into c
  from public.hotelier_conversations where id = '00000000-0000-4000-8000-00000000cc01';
  if c.hotelier_unread <> 0 or c.user_unread <> 1 or c.status <> 'resolved' then
    raise exception 'the state after the answer is wrong: % % %', c.hotelier_unread, c.user_unread, c.status;
  end if;
  if (select read_at from public.hotelier_messages where sender = 'user' and conversation_id = '00000000-0000-4000-8000-00000000cc01') is null then
    raise exception 'the traveller''s message is not read';
  end if;
  -- The counts and the state are not H's to write.
  begin
    update public.hotelier_conversations set status = 'open' where id = '00000000-0000-4000-8000-00000000cc01';
    raise exception 'H updated the conversation';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A's new message reopens the resolved chat; A closes it, and then nobody writes into it.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
insert into public.hotelier_messages (conversation_id, sender, text)
values ('00000000-0000-4000-8000-00000000cc01', 'user', 'А на 3-м этаже?');
do $$
begin
  if (select status from public.hotelier_conversations) <> 'open' then raise exception 'the chat did not reopen'; end if;
  perform public.hotelier_conversation_read('00000000-0000-4000-8000-00000000cc01');
  if (select user_unread from public.hotelier_conversations) <> 0 then raise exception 'A''s read did not count'; end if;
  if not public.hotelier_conversation_status('00000000-0000-4000-8000-00000000cc01', 'closed') then
    raise exception 'A did not close the chat';
  end if;
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc01', 'user', 'После закрытия');
    raise exception 'A wrote into a closed chat';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_conversation_closed' then raise; end if;
  end;
end $$;

-- B writes at most 20 messages a minute, strictly: each message of B's waits for B's lock of the transaction (held
-- until it ends), so a parallel transaction of B counts these 20 once they are committed instead of missing them.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
insert into public.hotelier_conversations (id, hotel_id)
select '00000000-0000-4000-8000-00000000cc02', id from rls_hotels where n = 2;
insert into public.hotelier_messages (conversation_id, sender, text)
select '00000000-0000-4000-8000-00000000cc02', 'user', 'Вопрос ' || n from generate_series(1, 20) n;
do $$
begin
  begin
    insert into public.hotelier_messages (conversation_id, sender, text)
    values ('00000000-0000-4000-8000-00000000cc02', 'user', 'Двадцать первый');
    raise exception 'B wrote 21 messages a minute';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_rate_limited' then raise; end if;
  end;
  if not exists (
    select 1 from pg_catalog.pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid() and l.mode = 'ExclusiveLock' and l.granted
      and ((l.classid::bigint << 32) | l.objid::bigint)
        = pg_catalog.hashtextextended('hotelier_messages:00000000-0000-4000-8000-0000000000b2', 0)
  ) then
    raise exception 'B''s messages do not hold B''s lock';
  end if;
end $$;

-- A guest reads and writes none of it.
reset request.jwt.claims;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.hotelier_conversations;
    raise exception 'a guest reads the conversations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.hotelier_messages;
    raise exception 'a guest reads the messages';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.is_hotelier_of('ota-1');
    raise exception 'a guest calls is_hotelier_of';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.hotelier_messages where conversation_id = '00000000-0000-4000-8000-00000000cc01') <> 3
  then
    raise exception 'A''s chat has lost or gained messages';
  end if;
  raise notice 'hotelier chat RLS: ok';
end $$;

rollback;
