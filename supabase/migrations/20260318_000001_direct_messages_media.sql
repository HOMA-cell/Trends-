-- DM image attachments (uses existing public "post-media" bucket).
-- Safe to run multiple times.

alter table public.direct_messages
  add column if not exists media_url text;

alter table public.direct_messages
  add column if not exists media_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'direct_messages_media_type_check'
  ) then
    alter table public.direct_messages
      add constraint direct_messages_media_type_check
      check (media_type is null or media_type in ('image'));
  end if;
end
$$;
