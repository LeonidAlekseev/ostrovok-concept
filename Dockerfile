# syntax=docker/dockerfile:1
# Local run: `docker compose up --build`, see README. No secret goes into a layer: the build gets the public
# NEXT_PUBLIC_* as build args and AGE_SECRET_KEY as a build secret; the running container gets keys from the
# environment (env_file .env) or decrypts secrets.app.env.age with AGE_SECRET_KEY.
# The base image is pinned (Node 24 as in CI, Alpine 3.24); the runtime has only POSIX sh and busybox.
FROM node:24.22.1-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS source
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .

# `docker compose run tools …` (make seed): dev dependencies and scripts/, keys from the environment at run time.
# uv and the system Python run scripts/*.py (make seed-local-geo: DuckDB, psycopg, pyosmium come as wheels at run time);
# they are only in this stage, the runner image does not have them.
FROM source AS tools
ENV NODE_ENV=development NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_root_ca.pem UV_PYTHON_PREFERENCE=only-system
RUN apk add --no-cache uv python3
CMD ["sh"]

FROM source AS build
ENV NEXT_OUTPUT=standalone
# The catalogue pages are prerendered from Supabase, so the build needs these two (they end up in the client bundle anyway).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
# `npm run build` runs scripts/secrets.mjs first: with AGE_SECRET_KEY it writes .env.production.local, removed right after.
# An empty build arg would shadow that file (Next.js never overrides a set variable), so empty ones are unset first.
RUN --mount=type=secret,id=age_secret_key,required=false \
    if [ -s /run/secrets/age_secret_key ]; then AGE_SECRET_KEY="$(cat /run/secrets/age_secret_key)"; export AGE_SECRET_KEY; fi; \
    for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do \
      eval "[ -n \"\$$name\" ] || unset $name"; \
    done; \
    npm run build && rm -f .env.production.local

FROM node:24.22.1-alpine3.24 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# GigaChat (Sber) serves a certificate of the Russian Trusted Root CA, which Node does not know; see docs/docker.md.
COPY --chown=app:app certs/russian_trusted_root_ca.pem /app/certs/russian_trusted_root_ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_root_ca.pem
USER app
EXPOSE 8080
# Logs go to stdout and stderr of this process.
CMD ["node", "server.js"]
