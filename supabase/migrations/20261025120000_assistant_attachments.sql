-- The photos of the chats with Эвал (src/lib/assistantChatsRemote.ts): a signed-in user's optimised photos live in
-- the private bucket `assistant-attachments` at `<user_id>/<chat_id>/<message_id>/<n>.webp`, read through signed
-- links by their owner only. «Поделиться» copies the photos of the snapshot to the public bucket
-- `assistant-shared-attachments` at `<user_id>/<share_id>/<n>.webp`: anyone with the link sees them, deleting the
-- chat leaves them. Only the owner writes into their own folder (the first segment of the path) of either bucket.
-- Idempotent: safe to re-run on a database that already has these objects.
--
-- Rollback (the photos are lost; take a copy of both buckets first):
--   drop policy if exists "assistant_attachments_select_own" on storage.objects;
--   drop policy if exists "assistant_attachments_insert_own" on storage.objects;
--   drop policy if exists "assistant_attachments_update_own" on storage.objects;
--   drop policy if exists "assistant_attachments_delete_own" on storage.objects;
--   drop policy if exists "assistant_shared_attachments_insert_own" on storage.objects;
--   drop policy if exists "assistant_shared_attachments_delete_own" on storage.objects;
--   delete from storage.objects where bucket_id in ('assistant-attachments', 'assistant-shared-attachments');
--   delete from storage.buckets where id in ('assistant-attachments', 'assistant-shared-attachments');
-- The site then answers about photos as before, and saving them fails with an honest message.

-- Up to 2 MB a photo: the browser sends WebP (JPEG where it cannot encode WebP) of 1600 px at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assistant-attachments', 'assistant-attachments', false, 2097152, array['image/webp', 'image/jpeg']),
  ('assistant-shared-attachments', 'assistant-shared-attachments', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The private bucket: its owner reads, writes and deletes the files of their own folder.
drop policy if exists "assistant_attachments_select_own" on storage.objects;
create policy "assistant_attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'assistant-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "assistant_attachments_insert_own" on storage.objects;
create policy "assistant_attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assistant-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "assistant_attachments_update_own" on storage.objects;
create policy "assistant_attachments_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'assistant-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'assistant-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "assistant_attachments_delete_own" on storage.objects;
create policy "assistant_attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assistant-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The public bucket: anyone reads by the public link (the bucket is public, no select policy lists the files);
-- the owner copies the snapshot's photos into their own folder and may delete them.
drop policy if exists "assistant_shared_attachments_insert_own" on storage.objects;
create policy "assistant_shared_attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assistant-shared-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "assistant_shared_attachments_delete_own" on storage.objects;
create policy "assistant_shared_attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assistant-shared-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
