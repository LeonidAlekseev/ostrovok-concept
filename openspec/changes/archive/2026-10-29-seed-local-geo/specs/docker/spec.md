## ADDED Requirements

### Requirement: Загрузка геоданных в локальную базу

Репозиторий SHALL содержать цель `make seed-local-geo`, которая в контейнере `tools` загружает в локальную базу здания EUBUCCO (с S3), границы покрытия (Nominatim) и места OSM (выгрузка Geofabrik «Valencia»), затем выполняет `db:features`. Шум EEA SHALL загружаться только при заданной `NOISE_GPKG`; без неё шаг пропускается с указанием, где скачать файл. Инструменты Python SHALL добавляться только в стадию `tools`, образ `runner` SHALL не меняться.

#### Scenario: Без файла шума

- **WHEN** выполняют `make seed-local-geo` без `NOISE_GPKG`
- **THEN** здания, границы и места загружены, шаг шума пропущен с сообщением и ссылкой на страницу EEA

#### Scenario: С файлом шума

- **WHEN** выполняют `NOISE_GPKG=/путь/ES.gpkg make seed-local-geo`
- **THEN** файл смонтирован в контейнер только для чтения и загружен командой `noise`
