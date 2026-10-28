# make up | down | logs | seed; the first run needs .env (cp .env.example .env), see README.
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
