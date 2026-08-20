-- Store new DM attachments in a private bucket and expose them only to participants.
alter table public.direct_messages
  add column if not exists media_path text;

drop policy if exists "direct_messages_insert_sender"
  on public.direct_messages;

create policy "direct_messages_insert_sender"
  on public.direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
    and char_length(trim(body)) > 0
    and coalesce(trim(media_url), '') = ''
    and (
      (media_path is null and media_type is null)
      or (
        split_part(media_path, '/', 1) = sender_id::text
        and split_part(media_path, '/', 2) = recipient_id::text
        and split_part(media_path, '/', 3) <> ''
        and media_type = 'image'
      )
    )
  );

-- Recipients only need to mark messages as read, never rewrite message content.
revoke update on table public.direct_messages from authenticated;
grant update (read_at) on table public.direct_messages to authenticated;
revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm-media',
  'dm-media',
  false,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dm_media_participant_read" on storage.objects;
drop policy if exists "dm_media_sender_upload" on storage.objects;
drop policy if exists "dm_media_sender_delete" on storage.objects;

create policy "dm_media_participant_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dm-media'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or split_part(name, '/', 2) = (select auth.uid())::text
    )
  );

create policy "dm_media_sender_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dm-media'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and split_part(name, '/', 2) <> (select auth.uid())::text
    and split_part(name, '/', 2) <> ''
    and split_part(name, '/', 3) <> ''
    and exists (
      select 1
      from public.profiles p
      where p.id::text = split_part(name, '/', 2)
    )
  );

create policy "dm_media_sender_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dm-media'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "post_media_auth_upload_own" on storage.objects;
drop policy if exists "post_media_auth_update_own" on storage.objects;
drop policy if exists "post_media_auth_delete_own" on storage.objects;

create policy "post_media_auth_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create policy "post_media_auth_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'post-media'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create policy "post_media_auth_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
