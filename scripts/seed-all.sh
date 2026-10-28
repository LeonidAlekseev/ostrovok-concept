#!/bin/sh
# make seed: the loading and rebuilding commands of package.json, in order, against the Supabase of .env.
# Runs inside the `tools` container of docker-compose.yml. Every step is idempotent.
set -eu

# Only AGE_SECRET_KEY given: write .env from secrets.app.env.age, the scripts read it.
if [ -n "${AGE_SECRET_KEY:-}" ] && [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  npm run secrets:reveal
fi

for step in db:push db:seed db:hotelier db:seed:hotelier-demo db:rebuild:ota db:features db:embed db:embed:chunks db:embed:photos; do
  echo "==> npm run $step"
  npm run "$step"
done
echo "==> seed done"
