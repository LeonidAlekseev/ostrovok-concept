#!/bin/sh
# make seed-local-geo: loads the geodata of Valencia from the primary sources into the local database, then rebuilds the
# derived data. Runs inside the `tools` container of docker-compose.local.yml after `make seed-local`; every step is
# idempotent. Order as in docs/data-sources.md: buildings, then the noise (cut to their extent) and the coverage.
set -eu

# Geofabrik's extract of the Valencia region (HEAD checked 2026-10-29, ~141 MB); the city's rectangle is cut from it.
PBF_URL=https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf
BBOX=39.27,-0.53,39.58,-0.27

echo "==> buildings: EUBUCCO v0.2, region ES52 from S3 (reads only the rows of Valencia)"
uv run scripts/load-valencia-geo.py buildings

# NOISE_GPKG is the path in the container; the Makefile mounts the file given on the host.
if [ -n "${NOISE_GPKG:-}" ] && [ -f "$NOISE_GPKG" ]; then
  echo "==> noise: EEA, round 2022, from $NOISE_GPKG"
  uv run scripts/load-valencia-geo.py noise "$NOISE_GPKG"
else
  echo "==> noise: skipped. ES.gpkg (~1.6 GB) is downloaded by hand from the EEA page"
  echo "    https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00"
  echo "    (file ES.gpkg), then: NOISE_GPKG=/path/to/ES.gpkg make seed-local-geo"
fi

echo "==> coverage: municipality and province boundaries from Nominatim"
uv run scripts/load-valencia-geo.py coverage

echo "==> places: OpenStreetMap, $PBF_URL"
npm run db:city-places -- --city València --pbf-url "$PBF_URL" --bbox "$BBOX"

for step in db:features; do
  echo "==> npm run $step"
  npm run "$step"
done

# db:features rewrites the hotels' documents; the vectors of the new chunks come from the NVIDIA API.
if [ -n "${NVIDIA_API_KEY:-}" ]; then
  echo "==> npm run db:embed:chunks"
  npm run db:embed:chunks
else
  echo "==> db:embed:chunks skipped: no NVIDIA_API_KEY in .env"
fi
echo "==> seed-local-geo done"
