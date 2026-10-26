-- Two things of the photos of the chats with Эвал.
--
-- 1. The limit of the photos (src/lib/ai/rateLimit.ts): 20 looks at the photos a minute per IP, counted here so that
--    every instance of the server counts in one window. The server calls `rate_limit_hit` with the service role key;
--    nobody else reads or writes the counters. The key is a hash of the IP, not the IP itself.
-- 2. The photos of the shared snapshots (src/lib/assistantShare.ts) at `assistant-shared-attachments`
--    `<user_id>/<share_id>/<n>.webp`: their owner may now list them, so deleting a snapshot removes its photos through
--    the Storage API (removing a file needs `select` as well as `delete`). A file is not deleted with SQL: that would
--    leave it in the storage behind the table; `npm run db:clean:shared-photos` removes the photos of the snapshots
--    deleted otherwise (with the account, by hand).
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (the server goes back to counting in its memory; the owners stop deleting their shared photos):
--   drop function if exists public.rate_limit_hit(text, integer, integer);
--   drop table if exists public.rate_limit_hits;
--   drop policy if exists "assistant_shared_attachments_select_own" on storage.objects;

create table if not exists public.rate_limit_hits (
  key text primary key check (char_length(key) <= 200),
  count integer not null,
  reset_at timestamptz not null
);

-- No policies: only the service role (it bypasses RLS) touches the counters.
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- Counts a hit of `hit_key` and tells whether it is still within `hit_limit` in the window of `window_seconds`:
-- the first hit after the window opens a new one. One statement, so concurrent hits never lose a count.
create or replace function public.rate_limit_hit(hit_key text, hit_limit integer, window_seconds integer)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  hits integer;
begin
  insert into public.rate_limit_hits as h (key, count, reset_at)
  values (hit_key, 1, now() + make_interval(secs => window_seconds))
  on conflict (key) do update
    set count = case when h.reset_at <= now() then 1 else h.count + 1 end,
        reset_at = case when h.reset_at <= now() then excluded.reset_at else h.reset_at end
  returning h.count into hits;
  -- Now and then the long-closed windows go, so the table keeps about the addresses of the last hour.
  if random() < 0.01 then
    delete from public.rate_limit_hits where reset_at < now() - interval '1 hour';
  end if;
  return hits <= hit_limit;
end
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- The owner lists their own folder of the public bucket (the snapshot's photos to delete with it).
drop policy if exists "assistant_shared_attachments_select_own" on storage.objects;
create policy "assistant_shared_attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'assistant-shared-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
