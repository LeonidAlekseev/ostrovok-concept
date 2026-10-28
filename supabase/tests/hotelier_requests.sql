-- Эвал's questions to the hotelier (`create_hotelier_request`, `answer_hotelier_request`) and the hybrid search of a
-- hotel's documents (`hotel_chunks_hybrid`): only the server asks, for a running run of `ask_hotelier` in the
-- traveller's own chat, never the traveller themselves; an identical open question is one request, the limits hold;
-- only a hotelier of the hotel answers, and the answer finishes the waiting run, its step and tells the chat.
-- Everything is rolled back. Run against the database (the transaction pooler: only
-- `set local`):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hotelier_requests.sql
-- A failed check raises an exception and psql stops with it; success prints «hotelier requests: ok».

begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'req-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'req-b@example.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'req-h@example.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'req-h2@example.test');
-- H is the demo hotelier: their answer is demonstration.
insert into public.hotelier_profiles (user_id, all_hotels, is_demo)
values ('00000000-0000-4000-8000-0000000000e1', true, true), ('00000000-0000-4000-8000-0000000000e2', false, false);
insert into public.assistant_chats (id, user_id)
values ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1');

create temporary table req_hotel on commit drop as select id from public.hotels order by id limit 1;
grant select on req_hotel to authenticated, anon, service_role;

-- A's chat with Эвал: the step of the tool and its run, started by the route (`running`); B's run of their own chat.
insert into public.assistant_chats (id, user_id)
values ('00000000-0000-4000-8000-00000000c0b2', '00000000-0000-4000-8000-0000000000b2');
insert into public.tool_runs (id, chat_id, user_id, tool_name, status)
values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-00000000c0a1',
    '00000000-0000-4000-8000-0000000000a1', 'ask_hotelier', 'running'),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-00000000c0a1',
    '00000000-0000-4000-8000-0000000000a1', 'ask_hotelier', 'running'),
  ('00000000-0000-4000-8000-0000000001a3', '00000000-0000-4000-8000-00000000c0a1',
    '00000000-0000-4000-8000-0000000000a1', 'ask_hotelier', 'running'),
  ('00000000-0000-4000-8000-0000000001a4', '00000000-0000-4000-8000-00000000c0a1',
    '00000000-0000-4000-8000-0000000000a1', 'ask_hotelier', 'running'),
  ('00000000-0000-4000-8000-0000000001a5', '00000000-0000-4000-8000-00000000c0a1',
    '00000000-0000-4000-8000-0000000000a1', 'ask_hotelier', 'running'),
  ('00000000-0000-4000-8000-0000000001a6', '00000000-0000-4000-8000-00000000c0a1',
    '00000000-0000-4000-8000-0000000000a1', 'hotel_noise', 'running'),
  ('00000000-0000-4000-8000-0000000001b1', '00000000-0000-4000-8000-00000000c0b2',
    '00000000-0000-4000-8000-0000000000b2', 'ask_hotelier', 'running');
insert into public.tool_runs (id, chat_id, user_id, tool_name, status, completed_at)
values ('00000000-0000-4000-8000-0000000001a7', '00000000-0000-4000-8000-00000000c0a1',
  '00000000-0000-4000-8000-0000000000a1', 'ask_hotelier', 'success', now());
insert into public.assistant_messages (id, chat_id, user_id, role, text, data)
values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-00000000c0a1',
  '00000000-0000-4000-8000-0000000000a1', 'agent', '',
  '{"step": {"agent": "hotelier", "title": "Запрос отельеру", "run": {"id": "00000000-0000-4000-8000-0000000001a1", "result": {"status": "pending"}}}}');

-- A asks nothing by themselves: neither the function nor a row of their own looks like Эвал's question.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
do $$
begin
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Свой вопрос',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a1');
    raise exception 'A called create_hotelier_request';
  exception when insufficient_privilege then null;
  end;
  begin
    with c as (
      insert into public.hotelier_conversations (hotel_id, user_id)
      select id, '00000000-0000-4000-8000-0000000000a1' from req_hotel
      returning id, hotel_id
    )
    insert into public.hotelier_requests (conversation_id, hotel_id, user_id, question, dedupe_key)
    select c.id, c.hotel_id, '00000000-0000-4000-8000-0000000000a1', 'Свой вопрос', repeat('0', 64) from c;
    raise exception 'A inserted a request';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The server asks for A, for the run it started in A's chat.
reset request.jwt.claims;
reset role;
create temporary table req_made (request uuid, conversation uuid, reused boolean) on commit drop;
grant all on req_made to authenticated, service_role;
set local role service_role;
insert into req_made
select * from public.create_hotelier_request(
  '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
  '  Есть ли балкон   в номерах Deluxe? ',
  '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a1',
  array['room.balcony', 'bad key'], null, 'Гость ищет номер с балконом');
update public.tool_runs set status = 'waiting', resume = jsonb_build_object('request_id', (select request from req_made))
where id = '00000000-0000-4000-8000-0000000001a1';

do $$
declare
  made req_made;
  again record;
  c public.hotelier_conversations;
begin
  select * into made from req_made;
  if made.reused then raise exception 'a new question was reused'; end if;
  select * into c from public.hotelier_conversations where id = made.conversation;
  if c.kind <> 'ai_request' or c.status <> 'waiting_hotelier' or c.hotelier_unread <> 1
    or c.user_id <> '00000000-0000-4000-8000-0000000000a1' or c.origin_tool_run_id <> '00000000-0000-4000-8000-0000000001a1'
  then
    raise exception 'the request conversation is wrong: % % %', c.kind, c.status, c.hotelier_unread;
  end if;
  if (select characteristic_keys from public.hotelier_requests where id = made.request) <> array['room.balcony'] then
    raise exception 'a bad characteristic key was kept';
  end if;
  if (select sender || ':' || text from public.hotelier_messages where conversation_id = made.conversation)
    <> 'ai_assistant:Есть ли балкон в номерах Deluxe?' then
    raise exception 'the assistant did not ask the question';
  end if;
  -- The same open question, in other spacing and case, of another run is the same request.
  select * into again from public.create_hotelier_request(
    '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
    'есть ли балкон в номерах deluxe?',
    '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a2',
    array['room.balcony']);
  if not again.reused or again.request <> made.request then raise exception 'the identical question was duplicated'; end if;
  -- Only a run of ask_hotelier of the traveller's chat, still running and not linked yet.
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Тот же запуск',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a1');
    raise exception 'a run asked twice';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_invalid' then raise; end if;
  end;
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Без запуска',
      '00000000-0000-4000-8000-00000000c0a1', null);
    raise exception 'a question without a run';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_invalid' then raise; end if;
  end;
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Другой инструмент',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a6');
    raise exception 'a run of another tool asked';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_invalid' then raise; end if;
  end;
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Законченный запуск',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a7');
    raise exception 'a finished run asked';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_invalid' then raise; end if;
  end;
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Чужой запуск',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001b1');
    raise exception 'A asked for B''s run';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_invalid' then raise; end if;
  end;
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000b2', (select id from req_hotel),
      'Чужой чат',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a3');
    raise exception 'B asked for A''s chat';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_invalid' then raise; end if;
  end;
  -- At most 3 open questions a hotel.
  perform public.create_hotelier_request(
    '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
    'Вопрос 2',
    '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a3');
  perform public.create_hotelier_request(
    '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
    'Вопрос 3',
    '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a4');
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Вопрос 4',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a5');
    raise exception 'a fourth open question was made';
  exception when raise_exception then
    if sqlerrm <> 'hotelier_request_limit' then raise; end if;
  end;
end $$;

-- A answers nothing of their own question.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
do $$
begin
  if exists (select 1 from public.answer_hotelier_request((select request from req_made),
    (select id from public.hotelier_messages limit 1))) then
    raise exception 'the traveller answered';
  end if;
end $$;

-- H2 has no access to the hotel: their answer does nothing.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e2", "role": "authenticated"}';
do $$
begin
  if exists (select 1 from public.answer_hotelier_request((select request from req_made), gen_random_uuid())) then
    raise exception 'H2 answered another hotel''s request';
  end if;
end $$;

-- H answers: the request, the run, its step and A's chat.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
insert into public.hotelier_messages (id, conversation_id, sender, text, shareable, request_id)
select '00000000-0000-4000-8000-0000000003e1', conversation, 'hotelier', 'Да, у Deluxe на 4–5 этажах балкон на запад',
  true, request
from req_made;
do $$
declare
  finished uuid[];
begin
  finished := array(select public.answer_hotelier_request((select request from req_made),
    '00000000-0000-4000-8000-0000000003e1'));
  if finished <> array['00000000-0000-4000-8000-0000000001a1'::uuid] then
    raise exception 'the waiting run was not finished: %', finished;
  end if;
  if (select status || ':' || knowledge_status from public.hotelier_requests where id = (select request from req_made))
    <> 'answered:queued' then
    raise exception 'the request is not answered and queued';
  end if;
  -- A second answer changes nothing.
  if exists (select 1 from public.answer_hotelier_request((select request from req_made),
    '00000000-0000-4000-8000-0000000003e1')) then
    raise exception 'the request was answered twice';
  end if;
  if (select status from public.hotelier_conversations where id = (select conversation from req_made)) <> 'open' then
    raise exception 'the conversation still waits';
  end if;
end $$;

reset role;
do $$
begin
  if (select status || ':' || (result_data ->> 'status') || ':' || (resume is null)::text
      from public.tool_runs where id = '00000000-0000-4000-8000-0000000001a1') <> 'success:success:true' then
    raise exception 'the run did not finish';
  end if;
  if (select data -> 'step' -> 'run' -> 'result' -> 'data' ->> 'answer'
      from public.assistant_messages where id = '00000000-0000-4000-8000-0000000002a1')
    <> 'Да, у Deluxe на 4–5 этажах балкон на запад' then
    raise exception 'the step of the chat was not updated';
  end if;
  if (select count(*) from public.assistant_messages
      where chat_id = '00000000-0000-4000-8000-00000000c0a1' and role = 'owner') <> 1 then
    raise exception 'the chat did not get the hotelier''s answer';
  end if;
  if not (select unread from public.assistant_chats where id = '00000000-0000-4000-8000-00000000c0a1') then
    raise exception 'the chat is not unread';
  end if;
  -- The demo hotelier's answer is marked demonstration: the message, the conversation, the run and the chat's message.
  if not (select m.is_demo and c.is_demo from public.hotelier_messages m
      join public.hotelier_conversations c on c.id = m.conversation_id
      where m.id = '00000000-0000-4000-8000-0000000003e1') then
    raise exception 'the demo answer is not marked';
  end if;
  if (select result_data -> 'data' ->> 'demo' from public.tool_runs where id = '00000000-0000-4000-8000-0000000001a1')
    <> 'true' or not exists (
      select 1 from public.assistant_messages
      where chat_id = '00000000-0000-4000-8000-00000000c0a1' and role = 'owner' and data ->> 'demo' = 'true'
    ) then
    raise exception 'the chat does not say the answer is demonstration';
  end if;
  -- The traveller's own question is not.
  if (select is_demo from public.hotelier_messages where sender = 'ai_assistant'
      and conversation_id = (select conversation from req_made)) then
    raise exception 'the assistant''s question is marked demonstration';
  end if;
end $$;

-- A guest asks nothing.
set local role anon;
do $$
begin
  begin
    perform public.create_hotelier_request(
      '00000000-0000-4000-8000-0000000000a1', (select id from req_hotel),
      'Гость',
      '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000001a5');
    raise exception 'a guest asked';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The hybrid search: the full text alone without a vector; a chunk found by both rankings is first.
reset role;
insert into public.evidence (id, type, title, provider, external_id)
values ('00000000-0000-4000-8000-0000000004e1', 'hotelier', 'Ответ отельера', 'Отельер', 'test-hybrid');
insert into public.documents (id, kind, hotel_id, evidence_id, text)
select '00000000-0000-4000-8000-0000000005d1', 'hotelier_answer', id, '00000000-0000-4000-8000-0000000004e1',
  'Номера Deluxe: балкон' from req_hotel;
insert into public.document_chunks (document_id, ord, text, embedding)
values
  ('00000000-0000-4000-8000-0000000005d1', 0, 'В номерах Deluxe есть балкон на запад',
    ('[' || array_to_string(array_fill(0.01::real, array[2048]), ',') || ']')::extensions.halfvec),
  ('00000000-0000-4000-8000-0000000005d1', 1, 'Окна выходят во двор', null);
do $$
declare
  first record;
begin
  select * into first from public.hotel_chunks_hybrid((select id from req_hotel), 'балкон', null, 5) limit 1;
  if first.text <> 'В номерах Deluxe есть балкон на запад' or first.vector_place is not null then
    raise exception 'the full text alone is wrong: %', first.text;
  end if;
  select * into first from public.hotel_chunks_hybrid((select id from req_hotel), 'балкон',
    ('[' || array_to_string(array_fill(0.01::real, array[2048]), ',') || ']')::extensions.halfvec, 5) limit 1;
  if first.fts_place <> 1 or first.vector_place <> 1 or abs(first.rank - 2.0 / 61) > 1e-9 then
    raise exception 'the fusion is wrong: % % %', first.fts_place, first.vector_place, first.rank;
  end if;
  raise notice 'hotelier requests: ok';
end $$;

rollback;
