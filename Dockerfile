# syntax=docker/dockerfile:1
# The standalone demo (branch `standalone`): the site without a database, its data the snapshot of data/standalone.
# Local run: `docker compose up --build`, see README. No secret goes into a layer: the build gets AGE_SECRET_KEY as a
# build secret; the running container gets NVIDIA_API_KEY from the environment (env_file .env) or decrypts
# secrets.app.env.age with AGE_SECRET_KEY.
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
# `npm run build` runs scripts/secrets.mjs first: with AGE_SECRET_KEY it writes .env.production.local, removed right after.
RUN --mount=type=secret,id=age_secret_key,required=false \
    if [ -s /run/secrets/age_secret_key ]; then AGE_SECRET_KEY="$(cat /run/secrets/age_secret_key)"; export AGE_SECRET_KEY; fi; \
    npm run build && rm -f .env.production.local

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
