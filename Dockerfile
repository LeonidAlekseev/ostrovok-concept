# syntax=docker/dockerfile:1
# Local run in Docker Desktop: `docker compose up --build`, see README «Docker». No secret goes into a layer:
# the build gets the public NEXT_PUBLIC_* as build args and, if set, AGE_SECRET_KEY as a build secret;
# the running container gets keys from the environment (env_file .env) or decrypts secrets.app.env.age with AGE_SECRET_KEY.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
# The catalogue pages are prerendered from Supabase, so the build needs these two (they end up in the client bundle anyway).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` runs scripts/secrets.mjs first: with AGE_SECRET_KEY it writes .env.production.local, removed right after.
# An empty build arg would shadow that file (Next.js never overrides a set variable), so empty ones are unset first.
RUN --mount=type=secret,id=age_secret_key,env=AGE_SECRET_KEY,required=false \
    for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY AGE_SECRET_KEY; do \
      eval "[ -n \"\$$name\" ] || unset $name"; \
    done; \
    npm run build && rm -f .env.production.local

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
