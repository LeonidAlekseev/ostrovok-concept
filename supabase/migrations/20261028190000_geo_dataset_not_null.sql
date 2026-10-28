-- `dataset` of geo_buildings and geo_noise allowed null only for the rows loaded before the provenance
-- (20261026120500_geo_data_provenance.sql); every row has one now (checked before this migration), so null is an error.
alter table public.geo_buildings alter column dataset set not null;
alter table public.geo_noise alter column dataset set not null;
