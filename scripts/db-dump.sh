#!/bin/sh
# make dump-db: dumps the live database (SUPABASE_DB_URL of .env, read only) into dist/db-dump/ for scripts/db-restore.sh.
# Two pg_dump archives (-Fc, compressed), run in postgres:17-alpine:
#   public.dump  the whole schema `public`, structure and data (a full dump: constraints come after the data, so the
#                cycle hotelier_messages <-> hotelier_conversations does not matter, unlike --data-only);
#   auth.dump    DATA only of auth.users, auth.identities and supabase_migrations.schema_migrations (so db:push does not
#                re-apply the migrations after the restore). No sessions, refresh tokens, codes, other auth tables, no
#                Storage files.
# Plus SHA256SUMS and MANIFEST. The connection string goes to the container by name and is never printed.
set -eu

cd "$(dirname "$0")/.."
OUT=dist/db-dump
IMAGE=postgres:17-alpine

# Only the connection string is taken from .env (the file is not sourced: it holds other keys).
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -f .env ]; then
  SUPABASE_DB_URL=$(sed -n 's/^SUPABASE_DB_URL=//p' .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")
fi
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo 'SUPABASE_DB_URL is not set (.env or the environment)' >&2
  exit 1
fi
export SUPABASE_DB_URL

mkdir -p "$OUT"
rm -f "$OUT/public.dump" "$OUT/auth.dump" "$OUT/SHA256SUMS" "$OUT/MANIFEST"

pg() {
  docker run --rm -i -e SUPABASE_DB_URL --user "$(id -u):$(id -g)" -v "$PWD/$OUT:/out" "$IMAGE" "$@"
}

echo "==> pg_dump: schema public"
pg sh -c 'pg_dump "$SUPABASE_DB_URL" -Fc --no-owner -n public -f /out/public.dump'
echo "==> pg_dump: data of auth.users, auth.identities, supabase_migrations.schema_migrations"
pg sh -c 'pg_dump "$SUPABASE_DB_URL" -Fc --no-owner --data-only \
  -t auth.users -t auth.identities -t supabase_migrations.schema_migrations -f /out/auth.dump'

echo "==> MANIFEST, SHA256SUMS"
{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "pg_dump: $(pg pg_dump --version)"
  echo "public.dump: schema public, structure and data"
  echo "auth.dump: data of auth.users, auth.identities, supabase_migrations.schema_migrations"
  echo "rows (exact counts, right after the dump):"
  pg sh -s <<'SQL'
psql "$SUPABASE_DB_URL" -Atq <<'Q' | sed 's/^/  /'
select format('%s.%s', n, t) || ': ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n, t), false, true, '')))[1]::text
from (
  select nspname n, relname t from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition
    and (nspname = 'public' or (nspname, relname) in (('auth', 'users'), ('auth', 'identities'), ('supabase_migrations', 'schema_migrations')))
) x order by n, t;
Q
SQL
} >"$OUT/MANIFEST"
{
  echo "size:"
  ls -l "$OUT" | awk '$9 ~ /\.dump$/ { printf "  %s: %d bytes\n", $9, $5 }'
} >>"$OUT/MANIFEST"
(cd "$OUT" && sha256sum public.dump auth.dump >SHA256SUMS)
echo "==> done: $OUT"
cat "$OUT/MANIFEST"
