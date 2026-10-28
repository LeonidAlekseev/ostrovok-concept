-- Folds the Ostrovok duplicate `ota-9783413` into `ota-9559092` (Reina 107 Beach Boutique: the same point and address;
-- the duplicate has a star rating of 20 and no page of its own). Ostrovok data of the kept hotel wins. See
-- src/lib/ota/merged.ts: the loaders skip the duplicate and `/hotels/ota-9783413` redirects to the kept hotel.
-- What the duplicate had of its own is moved to the kept hotel; what only mirrors the kept hotel's data (the entity,
-- the embedding, the features, the places, the page, the noise and place calculations) goes with its row.
-- Idempotent: with no duplicate left every statement matches nothing.

-- Rows people made, moved without loss (all empty at the time of writing; the guards keep a row that would collide).
update public.hotelier_conversations c set hotel_id = 'ota-9559092'
where c.hotel_id = 'ota-9783413'
  and exists (select 1 from public.hotels where id = 'ota-9559092')
  and not (c.kind = 'user' and c.status <> 'closed' and exists (
    select 1 from public.hotelier_conversations k
    where k.hotel_id = 'ota-9559092' and k.user_id = c.user_id and k.kind = 'user' and k.status <> 'closed'));
update public.hotelier_requests set hotel_id = 'ota-9559092'
where hotel_id = 'ota-9783413' and exists (select 1 from public.hotels where id = 'ota-9559092');
update public.documents set hotel_id = 'ota-9559092'
where hotel_id = 'ota-9783413' and exists (select 1 from public.hotels where id = 'ota-9559092');
insert into public.hotelier_hotel_access (user_id, hotel_id)
select a.user_id, 'ota-9559092' from public.hotelier_hotel_access a
where a.hotel_id = 'ota-9783413' and exists (select 1 from public.hotels where id = 'ota-9559092')
on conflict do nothing;

-- The duplicate itself; the rows tied to it by a foreign key (entities and their claims, features, room views,
-- hotelier access, pages, places) go with it.
delete from public.hotels where id = 'ota-9783413';
delete from public.ota_hotels where master_id = 9783413;
delete from public.embeddings where kind = 'hotel' and ref_id = 'ota-9783413';

-- The calculations and the sources of the duplicate, when no claim is left on them.
delete from public.calculations c
where (c.key like '%:ota-9783413' or c.key like '%:ota-9783413:%') and not exists (select 1 from public.claims l where l.calculation_id = c.id);
delete from public.evidence where external_id like 'poi:9783413:%';
