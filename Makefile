# make up | down | logs | seed; the first run needs .env (cp .env.example .env), see README. Local Supabase: up-local | down-local | seed-local | seed-local-geo.
.PHONY: up down logs seed

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f app

# Loads and rebuilds the data in the cloud Supabase (db:push, seed, rebuild, features, embed); can take a long time.
seed:
	docker compose run --rm --build tools sh scripts/seed-all.sh

# The additional variant with a local Supabase (docker-compose.local.yml, keys in .env.local-supabase), see docs/docker.md.
LOCAL = docker compose --env-file .env.local-supabase -f docker-compose.local.yml

.PHONY: up-local down-local seed-local seed-local-geo check-local-env

check-local-env:
	@test -f .env.local-supabase || { echo 'no .env.local-supabase: cp .env.local-supabase.example .env.local-supabase'; exit 1; }

up-local: check-local-env
	$(LOCAL) up --build

down-local: check-local-env
	$(LOCAL) down

# Applies the migrations and loads the data into the local database; the frontend starts building when it sees the catalogue.
seed-local: check-local-env
	$(LOCAL) run --rm --build tools sh scripts/seed-all.sh

# Loads the geodata of Valencia into the local database from the primary sources (EUBUCCO, Nominatim, Geofabrik) and rebuilds
# the features. The EEA noise (ES.gpkg, ~1.6 GB) is by hand: NOISE_GPKG=/path/ES.gpkg make seed-local-geo, else it is skipped.
seed-local-geo: check-local-env
	$(LOCAL) run --rm --build $(if $(NOISE_GPKG),-v "$(abspath $(NOISE_GPKG)):/data/ES.gpkg:ro" -e NOISE_GPKG=/data/ES.gpkg) tools sh scripts/seed-local-geo.sh
