## Why

Геоданные Валенсии (здания, границы, места OSM, шум) локально приходилось грузить вручную отдельными командами с файлами вне репозитория. Часть источников доступна по сети, и их можно загрузить одной командой.

## What Changes

- `make seed-local-geo` и `scripts/seed-local-geo.sh`: здания EUBUCCO с S3, границы через Nominatim, места OSM из выгрузки Geofabrik «Valencia», затем `db:features` и `db:embed:chunks`.
- Шум EEA (`ES.gpkg`, ~1,6 ГБ) остаётся ручным шагом: путь передаётся `NOISE_GPKG`, без переменной шаг пропускается с подсказкой.
- Стадия `tools` Dockerfile получает `uv` и `python3` (apk); стадия `runner` не меняется.
- Документация: `docs/data-sources.md`, `docs/docker.md`, таблица make в README.

## Impact

`Dockerfile` (стадия `tools`), `Makefile`, `scripts/seed-local-geo.sh`, `README.md`, `docs/`, спека `docker`. Миграций нет, код приложения и образ `runner` не меняются.
