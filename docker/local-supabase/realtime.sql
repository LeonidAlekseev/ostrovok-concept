-- Local Supabase (docker-compose.local.yml): the schema Realtime keeps its own tables in (`_realtime`), as in the
-- official self-host volumes/db/realtime.sql.
\set pguser `echo "supabase_admin"`

CREATE SCHEMA IF NOT EXISTS _realtime;
ALTER SCHEMA _realtime OWNER TO :pguser;
