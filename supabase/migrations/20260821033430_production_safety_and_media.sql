-- Production safety controls, account lifecycle cleanup, and video thumbnails.

alter table public.posts
  add column if not exists media_thumbnail_url text;

comment on column public.posts.media_thumbnail_url is
  'Public poster image generated client-side for uploaded videos.';

-- Auth deletion must remove the user's public data instead of failing on FKs.
alter table public.posts
  drop constraint if exists posts_user_id_fkey;

alter table public.posts
  add constraint posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id, created_at desc);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint content_reports_target_type_check
    check (target_type in ('post', 'profile', 'comment', 'message')),
  constraint content_reports_reason_check
    check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  constraint content_reports_status_check
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  constraint content_reports_details_length_check
    check (details is null or char_length(details) <= 1000)
);

create index if not exists content_reports_review_queue_idx
  on public.content_reports (status, created_at desc);

create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;

drop policy if exists "user_blocks_select_participant" on public.user_blocks;
create policy "user_blocks_select_participant"
  on public.user_blocks for select
  to authenticated
  using ((select auth.uid()) in (blocker_id, blocked_id));

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own"
  on public.user_blocks for insert
  to authenticated
  with check ((select auth.uid()) = blocker_id);

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own"
  on public.user_blocks for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

drop policy if exists "content_reports_select_own" on public.content_reports;
create policy "content_reports_select_own"
  on public.content_reports for select
  to authenticated
  using ((select auth.uid()) = reporter_id);

drop policy if exists "content_reports_insert_own" on public.content_reports;
create policy "content_reports_insert_own"
  on public.content_reports for insert
  to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and target_user_id is distinct from (select auth.uid())
  );

revoke all privileges on table public.user_blocks from anon, authenticated;
revoke all privileges on table public.content_reports from anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant select, insert on table public.content_reports to authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.users_are_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when first_user is null or second_user is null then false
    when (select auth.uid()) is null then false
    when (select auth.uid()) is not null
      and (select auth.uid()) not in (first_user, second_user) then false
    else exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = first_user and b.blocked_id = second_user)
         or (b.blocker_id = second_user and b.blocked_id = first_user)
    )
  end;
$$;

revoke all on function private.users_are_blocked(uuid, uuid) from public;
grant execute on function private.users_are_blocked(uuid, uuid) to anon, authenticated;

-- Remove follows immediately when either participant blocks the other.
create or replace function private.cleanup_blocked_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  delete from public.notifications
  where (user_id = new.blocker_id and actor_id = new.blocked_id)
     or (user_id = new.blocked_id and actor_id = new.blocker_id);

  return new;
end;
$$;

revoke all on function private.cleanup_blocked_relationship() from public, anon, authenticated;

drop trigger if exists on_user_block_cleanup_relationship on public.user_blocks;
create trigger on_user_block_cleanup_relationship
  after insert on public.user_blocks
  for each row execute function private.cleanup_blocked_relationship();

-- Apply block rules at the Data API boundary, not only in the UI.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_visible"
  on public.profiles for select
  to anon, authenticated
  using (
    (select auth.uid()) is null
    or id = (select auth.uid())
    or exists (
      select 1
      from public.user_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = profiles.id
    )
    or not private.users_are_blocked((select auth.uid()), id)
  );

drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
  on public.posts for select
  to anon, authenticated
  using (
    (visibility <> 'private' or (select auth.uid()) = user_id)
    and (
      (select auth.uid()) is null
      or user_id = (select auth.uid())
      or not private.users_are_blocked((select auth.uid()), user_id)
    )
  );

drop policy if exists "comments_select_visible_posts" on public.comments;
create policy "comments_select_visible_posts"
  on public.comments for select
  to anon, authenticated
  using (
    (
      (select auth.uid()) is null
      or user_id = (select auth.uid())
      or not private.users_are_blocked((select auth.uid()), user_id)
    )
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
    )
  );

drop policy if exists "comments_insert_own_visible_posts" on public.comments;
create policy "comments_insert_own_visible_posts"
  on public.comments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
        and not private.users_are_blocked((select auth.uid()), p.user_id)
    )
  );

drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_visible"
  on public.follows for select
  to anon, authenticated
  using (
    (select auth.uid()) is null
    or not private.users_are_blocked(follower_id, following_id)
  );

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and follower_id <> following_id
    and not private.users_are_blocked(follower_id, following_id)
  );

drop policy if exists "post_likes_select_visible_posts" on public.post_likes;
create policy "post_likes_select_visible_posts"
  on public.post_likes for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_likes.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
        and (
          (select auth.uid()) is null
          or not private.users_are_blocked((select auth.uid()), p.user_id)
        )
    )
  );

drop policy if exists "post_likes_insert_own_visible_post" on public.post_likes;
create policy "post_likes_insert_own_visible_post"
  on public.post_likes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = post_likes.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
        and not private.users_are_blocked((select auth.uid()), p.user_id)
    )
  );

drop policy if exists "notifications_select_target_user" on public.notifications;
create policy "notifications_select_target_user"
  on public.notifications for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      actor_id is null
      or not private.users_are_blocked((select auth.uid()), actor_id)
    )
  );

drop policy if exists "notifications_insert_actor" on public.notifications;
create policy "notifications_insert_actor"
  on public.notifications for insert
  to authenticated
  with check (
    (select auth.uid()) = actor_id
    and user_id <> actor_id
    and not private.users_are_blocked(actor_id, user_id)
  );

drop policy if exists "direct_messages_select_participants" on public.direct_messages;
create policy "direct_messages_select_participants"
  on public.direct_messages for select
  to authenticated
  using (
    ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id)
    and not private.users_are_blocked(sender_id, recipient_id)
  );

drop policy if exists "direct_messages_insert_sender" on public.direct_messages;
create policy "direct_messages_insert_sender"
  on public.direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
    and not private.users_are_blocked(sender_id, recipient_id)
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

drop policy if exists "direct_messages_update_recipient" on public.direct_messages;
create policy "direct_messages_update_recipient"
  on public.direct_messages for update
  to authenticated
  using (
    (select auth.uid()) = recipient_id
    and not private.users_are_blocked(sender_id, recipient_id)
  )
  with check (
    (select auth.uid()) = recipient_id
    and sender_id <> recipient_id
    and not private.users_are_blocked(sender_id, recipient_id)
    and char_length(trim(body)) > 0
  );

-- Use human-readable defaults instead of UUID-shaped public identities.
create or replace function public.ensure_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_name text;
begin
  email_name := nullif(
    trim(
      initcap(
        regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^[:alnum:]]+', ' ', 'g')
      )
    ),
    ''
  );

  insert into public.profiles (
    id, handle, display_name, created_at, updated_at
  )
  values (
    new.id,
    'member_' || left(replace(new.id::text, '-', ''), 8),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      email_name,
      'Trends Member'
    ),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.ensure_profile_for_new_user()
  from public, anon, authenticated;

update public.profiles p
set handle = 'member_' || left(replace(p.id::text, '-', ''), 8),
    updated_at = now()
where p.handle is null
   or p.handle ~ '^user_[0-9a-f]{32}$';

update public.profiles p
set display_name = coalesce(
      nullif(
        trim(
          initcap(
            regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[^[:alnum:]]+', ' ', 'g')
          )
        ),
        ''
      ),
      'Trends Member'
    ),
    updated_at = now()
from auth.users u
where u.id = p.id
  and (p.display_name is null or lower(trim(p.display_name)) = 'user');

notify pgrst, 'reload schema';
