-- The demonstration data of the chats with the hoteliers (hotelier-demo): the demo hotelier's answers and the messages
-- of `npm run db:seed:hotelier-demo` are synthetic, so they and their conversations are flagged `is_demo`, and the
-- answer that reaches the traveller's chat with Эвал says so (`data.demo`). The interface marks them «демо»
-- everywhere; the claims and the evidence of those answers have `is_demo` since 20261028140000_hotelier_knowledge.sql.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback: re-run the two functions of 20261028130000_hotelier_chat.sql and 20261028140000_hotelier_knowledge.sql,
-- then `alter table public.hotelier_messages drop column if exists is_demo;
-- alter table public.hotelier_conversations drop column if exists is_demo;`.

alter table public.hotelier_messages add column if not exists is_demo boolean not null default false;
alter table public.hotelier_conversations add column if not exists is_demo boolean not null default false;

-- A new message: as in 20261028130000_hotelier_chat.sql, and its demonstration flag — the author's (the demo hotelier)
-- or the one the demo data set — which the conversation takes.
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


-- The hotelier's answer to a request: as in 20261028140000_hotelier_knowledge.sql, and the demo hotelier's answer is
-- marked demonstration in the run's data and in the traveller's chat.
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
      'knowledge', case when m.shareable then 'queued' else 'none' end,
      'demo', m.is_demo
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
      jsonb_build_object('hotelierRequest', r.id) || case when m.is_demo then '{"demo": true}'::jsonb else '{}'::jsonb end);
    update public.assistant_chats a set unread = true, updated_at = now() where a.id = run.chat_id;
    return next run.id;
  end loop;
end;
$$;

