-- A shared snapshot remembers the chat it was made from, so deleting the chat deletes its snapshots (and their photos
-- in `assistant-shared-attachments`) too: src/lib/assistantShare.ts (`deleteChatShares`). No foreign key: the snapshot is a
-- copy and outlives the row until the client removes it with its photos. Snapshots made before this have no chat id and
-- stay until deleted by hand. Idempotent.
--
-- Rollback: `drop index if exists public.assistant_chat_shares_chat_id_idx; alter table public.assistant_chat_shares drop column if exists chat_id;`

alter table public.assistant_chat_shares add column if not exists chat_id uuid;

create index if not exists assistant_chat_shares_chat_id_idx on public.assistant_chat_shares (chat_id) where chat_id is not null;
