# syntax=docker/dockerfile:1
# The standalone demo (branch `standalone`): the site without a database, its data the snapshot of data/standalone.
# Local run: `docker compose up --build`, see README. The demo needs no keys: it calls no external API of its own.
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
ENV NODE_ENV=development UV_PYTHON_PREFERENCE=only-system
RUN apk add --no-cache uv python3
CMD ["sh"]

FROM source AS build
ENV NEXT_OUTPUT=standalone
RUN npm run build

FROM node:24.22.1-alpine3.24 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 8080
# Logs go to stdout and stderr of this process.
CMD ["node", "server.js"]
