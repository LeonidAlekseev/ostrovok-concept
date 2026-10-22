-- The catalog's order: the site lists destinations and hotels by `position` (then `id`), as the generator
-- builds them; `npm run db:seed` writes it. A row added by hand without a position goes after the rest.
alter table public.destinations add column if not exists position int;
alter table public.hotels add column if not exists position int;

create index if not exists hotels_position_idx on public.hotels (position);
