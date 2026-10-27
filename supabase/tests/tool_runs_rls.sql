-- RLS of `tool_runs` and `tool_run_evidence`: each user sees and changes only their own runs, a guest none, and two
-- runs of one chat at once are rows of their own. Everything is rolled back. Run against the database (the transaction
-- pooler: only `set local`):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tool_runs_rls.sql
-- A failed check raises an exception and psql stops with it; success prints «tool_runs RLS: ok».

begin;

-- Two users with a chat each.
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'rls-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'rls-b@example.test');
insert into public.assistant_chats (id, user_id)
values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-00000000c0b2', '00000000-0000-4000-8000-0000000000b2');

-- User A: two runs of the same chat at once, each its own row, then one finished with a source.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

insert into public.tool_runs (id, chat_id, tool_name, input_summary)
values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-00000000c0a1', 'noise_analysis', 'ota-9096882'),
  ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-00000000c0a1', 'noise_analysis', 'ota-7857547');

update public.tool_runs
set status = 'success', result_summary = 'Ночью 55–59 дБ', result_data = '{"status": "success"}', completed_at = now()
where id = '00000000-0000-4000-8000-0000000001a1';

insert into public.tool_run_evidence (tool_run_id, evidence_id)
select '00000000-0000-4000-8000-0000000001a1', id from public.evidence limit 1;

do $$
begin
  if (select count(*) from public.tool_runs) <> 2 then raise exception 'A does not see both own runs'; end if;
  if (select status from public.tool_runs where id = '00000000-0000-4000-8000-0000000002a1') <> 'running' then
    raise exception 'the parallel run changed with the other';
  end if;
  if (select count(*) from public.tool_run_evidence) <> 1 then raise exception 'A does not see the run''s source'; end if;
end $$;

-- A cannot write a run into B's chat, nor for B.
do $$
begin
  begin
    insert into public.tool_runs (chat_id, tool_name) values ('00000000-0000-4000-8000-00000000c0b2', 'noise_analysis');
    raise exception 'A wrote into B''s chat';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.tool_runs (chat_id, user_id, tool_name)
    values ('00000000-0000-4000-8000-00000000c0b2', '00000000-0000-4000-8000-0000000000b2', 'noise_analysis');
    raise exception 'A wrote a run as B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- User B sees none of A's runs or sources and cannot change or delete them.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';

do $$
declare
  changed integer;
begin
  if (select count(*) from public.tool_runs) <> 0 then raise exception 'B sees A''s runs'; end if;
  if (select count(*) from public.tool_run_evidence) <> 0 then raise exception 'B sees A''s sources'; end if;
  update public.tool_runs set result_summary = 'B' where id = '00000000-0000-4000-8000-0000000002a1';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'B changed A''s run'; end if;
  delete from public.tool_runs where id = '00000000-0000-4000-8000-0000000001a1';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'B deleted A''s run'; end if;
end $$;

insert into public.tool_runs (chat_id, tool_name) values ('00000000-0000-4000-8000-00000000c0b2', 'noise_analysis');

do $$
begin
  if (select count(*) from public.tool_runs) <> 1 then raise exception 'B does not see own run'; end if;
end $$;

-- A guest has none and writes none.
reset request.jwt.claims;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.tool_runs;
    raise exception 'a guest reads tool_runs';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A's runs are still as A left them.
reset role;
do $$
begin
  if (select count(*) from public.tool_runs where user_id = '00000000-0000-4000-8000-0000000000a1') <> 2 then
    raise exception 'A''s runs changed';
  end if;
  raise notice 'tool_runs RLS: ok';
end $$;

rollback;
