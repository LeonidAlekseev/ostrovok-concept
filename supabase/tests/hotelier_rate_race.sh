#!/usr/bin/env bash
# The limit of 20 messages a minute of one author holds for parallel transactions: while one transaction of B writes 20
# messages into one chat and is not committed yet, B's 21st message into another chat waits for it and is refused
# (`hotelier_rate_limited`). Two sessions cannot share one transaction, so this runs on a throwaway local Postgres in
# Docker — never the live database — with the tables the trigger reads and `hotelier_message_added` as the newest
# migration defines it.
#   bash supabase/tests/hotelier_rate_race.sh
# Prints «hotelier rate race: ok»; exits non-zero when the 21st message got through.
set -euo pipefail
cd "$(dirname "$0")/../.."
migration=$(ls supabase/migrations/*.sql | xargs grep -l 'function public.hotelier_message_added()' | sort | tail -1)
work=$(mktemp -d)
name="hotelier-rate-race-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

{
  cat <<'SQL'
create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table public.hotelier_profiles (user_id uuid primary key, is_demo boolean default false);
create table public.hotelier_conversations (id uuid primary key, status text default 'open', kind text default 'user',
  last_message_at timestamptz, last_message_text text, last_sender text, is_demo boolean default false,
  user_unread int default 0, hotelier_unread int default 0);
create table public.hotelier_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid,
  sender text, author_id uuid, text text, shareable boolean default false, is_demo boolean default false,
  knowledge_due_at timestamptz, knowledge_attempts smallint default 0, created_at timestamptz default now());
insert into public.hotelier_conversations (id)
values ('00000000-0000-4000-8000-00000000cc01'), ('00000000-0000-4000-8000-00000000cc02');
SQL
  # The function as the newest migration has it.
  awk '/^create or replace function public.hotelier_message_added\(\)/ {on = 1} on {print} on && /^\$\$;/ {exit}' \
    "$migration"
  echo 'create trigger hotelier_messages_added before insert on public.hotelier_messages'
  echo '  for each row execute function public.hotelier_message_added();'
} >"$work/setup.sql"
cat >"$work/first.sql" <<'SQL'
begin;
insert into public.hotelier_messages (conversation_id, sender, author_id, text)
select '00000000-0000-4000-8000-00000000cc01', 'user', '00000000-0000-4000-8000-0000000000b2', 'Вопрос ' || n
from generate_series(1, 20) n;
select pg_sleep(3);
commit;
SQL
cat >"$work/second.sql" <<'SQL'
select pg_sleep(1);
insert into public.hotelier_messages (conversation_id, sender, author_id, text)
values ('00000000-0000-4000-8000-00000000cc02', 'user', '00000000-0000-4000-8000-0000000000b2', 'Двадцать первый');
SQL

docker run -d --name "$name" -e POSTGRES_PASSWORD=race -v "$work:/race:ro" postgres:17-alpine >/dev/null
until docker exec "$name" pg_isready -U postgres -q 2>/dev/null; do sleep 0.5; done
sleep 1
docker exec "$name" psql -U postgres -q -v ON_ERROR_STOP=1 -f /race/setup.sql
docker exec "$name" psql -U postgres -q -v ON_ERROR_STOP=1 -f /race/first.sql >/dev/null &
first=$!
second=$(docker exec "$name" psql -U postgres -q -f /race/second.sql 2>&1 || true)
wait "$first"
total=$(docker exec "$name" psql -U postgres -At -c 'select count(*) from public.hotelier_messages')
if [[ "$second" != *hotelier_rate_limited* || "$total" != 20 ]]; then
  echo "hotelier rate race: the 21st message got through ($total messages)" >&2
  exit 1
fi
echo 'hotelier rate race: ok'
