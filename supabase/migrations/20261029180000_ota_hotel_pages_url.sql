-- The address of the hotel's page on Ostrovok, kept as the snapshot says it (`npm run db:load:ota-pages` reads it from
-- the route of the page's `__NEXT_DATA__`, never builds it from a template): the sources of Эвал's answers link to it
-- (`evidence.url` of the page facts and the reviews, written by `npm run db:features`). Null for a page whose snapshot
-- has no route. Idempotent. Rollback: `alter table public.ota_hotel_pages drop column if exists url;`
alter table public.ota_hotel_pages add column if not exists url text
  check (url is null or url ~ '^https://([a-z0-9-]+\.)*ostrovok\.ru/');
