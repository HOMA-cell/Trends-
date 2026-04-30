-- Ensure required Storage buckets exist for Trends.
-- Safe to run multiple times.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public;

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public;

