#!/bin/sh
# make restore-local: restores the dump of scripts/db-dump.sh into the local Supabase of docker-compose.local.yml,
# instead of `make seed-local`. Run `make up-local` first (the database and Auth must be up: Auth creates the schema auth).
# The dump is read from dist/db-dump/ or downloaded from a GitHub Release (private repos: `gh auth login` first):
#   make restore-local                                   # dist/db-dump/, else the release data-2026-10-29
#   TAG=data-2026-10-29 REPO=owner/name make restore-local
# DESTRUCTIVE for the local database: drops and recreates the schema public, replaces auth.users, auth.identities and
# supabase_migrations.schema_migrations. Nothing else is touched. The password comes from .env.local-supabase, never printed.
set -eu

cd "$(dirname "$0")/.."
DIR=dist/db-dump
TAG=${TAG:-data-2026-10-29}
REPO=${REPO:-ostrovok-hackathon-2026/lil-team}
IMAGE=postgres:17-alpine
NETWORK=ostrovok-local_default

if [ ! -f "$DIR/public.dump" ] || [ ! -f "$DIR/auth.dump" ] || [ ! -f "$DIR/SHA256SUMS" ]; then
  command -v gh >/dev/null 2>&1 || { echo "no $DIR/ and no gh: put the dump files there or install gh and run gh auth login" >&2; exit 1; }
  echo "==> downloading release $TAG of $REPO into $DIR"
  mkdir -p "$DIR"
  gh release download "$TAG" --repo "$REPO" --dir "$DIR" --clobber
fi

echo "==> checking SHA256SUMS"
(cd "$DIR" && sha256sum -c SHA256SUMS)

[ -f .env.local-supabase ] || { echo 'no .env.local-supabase: cp .env.local-supabase.example .env.local-supabase' >&2; exit 1; }
POSTGRES_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env.local-supabase | tail -n 1)
[ -n "$POSTGRES_PASSWORD" ] || { echo 'POSTGRES_PASSWORD is empty in .env.local-supabase' >&2; exit 1; }
docker network inspect "$NETWORK" >/dev/null 2>&1 || { echo "no network $NETWORK: run make up-local first" >&2; exit 1; }
export PGPASSWORD=$POSTGRES_PASSWORD

# pg_restore 17 reads the archives (the server is Postgres 15; the newer client is fine).
pg() {
  docker run --rm -i -e PGPASSWORD --network "$NETWORK" -v "$PWD/$DIR:/dump:ro" "$IMAGE" "$@"
}
PGCONN='-h db -U postgres -d postgres'

echo "==> waiting for the database and the schema auth (created by the Auth service)"
i=0
until pg psql $PGCONN -Atqc 'select 1 from auth.users limit 0' >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 30 ] || { echo 'auth.users does not exist: is `make up-local` running?' >&2; exit 1; }
  sleep 2
done

echo "==> resetting: schema public, auth.users, auth.identities, supabase_migrations.schema_migrations"
pg psql $PGCONN -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade;
truncate auth.users, auth.identities cascade;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
truncate supabase_migrations.schema_migrations;
SQL

# Auth first, so the foreign keys of public (profiles and others -> auth.users) are added over existing rows.
echo "==> restoring auth data (users, identities, migration history)"
pg pg_restore $PGCONN --no-owner --exit-on-error --single-transaction --data-only /dump/auth.dump
echo "==> restoring schema public"
pg pg_restore $PGCONN --no-owner --exit-on-error --single-transaction /dump/public.dump

echo "==> analyze"
pg psql $PGCONN -v ON_ERROR_STOP=1 -qc 'analyze'
echo "==> restore done: sign in with the DEMO_* accounts of the live database; db:push has nothing left to apply"
