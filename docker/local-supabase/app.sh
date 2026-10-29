#!/bin/sh
# The frontend of docker-compose.local.yml. The catalogue pages are prerendered from Supabase, so `next build` needs a
# seeded database: wait for the catalogue (make seed-local), build, then serve on 8080.
set -eu

url="$NEXT_PUBLIC_SUPABASE_URL/rest/v1/hotels?select=id&limit=1"
echo "==> waiting for the catalogue at $NEXT_PUBLIC_SUPABASE_URL (run make seed-local in another terminal)"
while :; do
  body="$(wget -q -O - --header "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" "$url" 2>/dev/null || true)"
  case "$body" in '[{'*) break ;; esac
  sleep 5
done

echo "==> npm run build"
npm run build
# `npm run build` decrypts the cloud keys into this file when AGE_SECRET_KEY is set; the local variant must not keep it.
rm -f .env.production.local

echo "==> next start :8080"
exec npx next start -p 8080 -H 0.0.0.0
