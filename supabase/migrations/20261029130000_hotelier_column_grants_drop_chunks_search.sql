-- 1. The columns of the hotelier chat tables that `authenticated` may select, as a function: a migration that adds a
--    column to one of them ends with `select public.refresh_hotelier_column_grants();`, and the column is selectable
--    (unless it is in the hidden list below, which a new column joins by a new version of this function). Before, the
--    grant lived in a block of 20261028160000_hotelier_hardening.sql, and a new column stayed invisible to the
--    browser and to Realtime until someone repeated that block.
-- 2. `hotel_chunks_search` is dropped: the app and /api/docs call only `hotel_chunks_hybrid` (words and meaning).
-- Idempotent: safe to re-run.
--
-- Rollback:
--   drop function if exists public.refresh_hotelier_column_grants();
--   then re-run `hotel_chunks_search` and its grants of 20261027220000_claims_evidence_store.sql.

create or replace function public.refresh_hotelier_column_grants()
returns void
language plpgsql
set search_path = ''
as $$
declare
  hidden jsonb := jsonb_build_object(
    'hotelier_conversations', array['user_id', 'origin_chat_id', 'origin_tool_run_id'],
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

-- Migrations run it; the browser's roles never do.
revoke all on function public.refresh_hotelier_column_grants() from public, anon, authenticated;

select public.refresh_hotelier_column_grants();

drop function if exists public.hotel_chunks_search(text, text, integer);
