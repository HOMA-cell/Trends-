-- Canonical production RLS and Data API grants for Trends.
-- This removes permissive legacy policies without changing user data.

do $$
declare
  target_table text;
  existing_policy record;
begin
  foreach target_table in array array[
    'profiles',
    'posts',
    'comments',
    'follows',
    'post_likes',
    'workout_templates',
    'workout_sets',
    'notifications',
    'exercise_prs',
    'direct_messages'
  ]
  loop
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        existing_policy.policyname,
        target_table
      );
    end loop;
  end loop;
end
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.post_likes enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_sets enable row level security;
alter table public.notifications enable row level security;
alter table public.exercise_prs enable row level security;
alter table public.direct_messages enable row level security;

-- Profiles are public, but only their owner may write them.
create policy "profiles_select_all"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = id);

-- Public posts are readable by anyone. Private posts are owner-only.
create policy "posts_select_visible"
  on public.posts for select
  to anon, authenticated
  using (visibility <> 'private' or (select auth.uid()) = user_id);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "comments_select_visible_posts"
  on public.comments for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
    )
  );

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
    )
  );

create policy "comments_update_own"
  on public.comments for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "comments_delete_own"
  on public.comments for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "follows_select_all"
  on public.follows for select
  to anon, authenticated
  using (true);

create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and follower_id <> following_id
  );

create policy "follows_delete_own"
  on public.follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id);

create policy "post_likes_select_visible_posts"
  on public.post_likes for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_likes.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
    )
  );

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
    )
  );

create policy "post_likes_delete_own"
  on public.post_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workout_templates_select_own"
  on public.workout_templates for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workout_templates_insert_own"
  on public.workout_templates for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workout_templates_update_own"
  on public.workout_templates for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "workout_templates_delete_own"
  on public.workout_templates for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workout_sets_select_visible_posts"
  on public.workout_sets for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = workout_sets.post_id
        and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
    )
  );

create policy "workout_sets_insert_own_post"
  on public.workout_sets for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = workout_sets.post_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "workout_sets_update_own"
  on public.workout_sets for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "workout_sets_delete_own"
  on public.workout_sets for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications_select_target_user"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications_insert_actor"
  on public.notifications for insert
  to authenticated
  with check (
    (select auth.uid()) = actor_id
    and user_id <> actor_id
  );

create policy "notifications_update_target_user"
  on public.notifications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notifications_delete_target_user"
  on public.notifications for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "exercise_prs_select_own"
  on public.exercise_prs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "exercise_prs_insert_own"
  on public.exercise_prs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "exercise_prs_update_own"
  on public.exercise_prs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "exercise_prs_delete_own"
  on public.exercise_prs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "direct_messages_select_participants"
  on public.direct_messages for select
  to authenticated
  using (
    (select auth.uid()) = sender_id
    or (select auth.uid()) = recipient_id
  );

create policy "direct_messages_insert_sender"
  on public.direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
    and char_length(trim(body)) > 0
  );

create policy "direct_messages_update_recipient"
  on public.direct_messages for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check (
    (select auth.uid()) = recipient_id
    and sender_id <> recipient_id
    and char_length(trim(body)) > 0
  );

create policy "direct_messages_delete_sender"
  on public.direct_messages for delete
  to authenticated
  using ((select auth.uid()) = sender_id);

-- Explicit Data API grants avoid both legacy over-grants and future default changes.
revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.posts from anon, authenticated;
revoke all privileges on table public.comments from anon, authenticated;
revoke all privileges on table public.follows from anon, authenticated;
revoke all privileges on table public.post_likes from anon, authenticated;
revoke all privileges on table public.workout_templates from anon, authenticated;
revoke all privileges on table public.workout_sets from anon, authenticated;
revoke all privileges on table public.notifications from anon, authenticated;
revoke all privileges on table public.exercise_prs from anon, authenticated;
revoke all privileges on table public.direct_messages from anon, authenticated;

grant select on table public.profiles, public.posts, public.comments,
  public.follows, public.post_likes, public.workout_sets
  to anon;

grant select, insert, update, delete on table public.profiles,
  public.posts, public.comments, public.workout_templates, public.workout_sets,
  public.notifications, public.exercise_prs, public.direct_messages
  to authenticated;

grant select, insert, delete on table public.follows, public.post_likes
  to authenticated;

-- Remove old bucket policies that allowed uploads outside the user's folder.
drop policy if exists "Give anon users access to JPG images in folder 8o6wzb_0"
  on storage.objects;
drop policy if exists "Give users access to own folder 8o6wzb_0"
  on storage.objects;
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_auth_upload_own" on storage.objects;
drop policy if exists "avatars_auth_update_own" on storage.objects;
drop policy if exists "avatars_auth_delete_own" on storage.objects;
drop policy if exists "post_media_public_read" on storage.objects;
drop policy if exists "post_media_auth_upload_own" on storage.objects;
drop policy if exists "post_media_auth_update_own" on storage.objects;
drop policy if exists "post_media_auth_delete_own" on storage.objects;

create policy "avatars_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars_auth_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create policy "avatars_auth_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create policy "avatars_auth_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create policy "post_media_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-media');

create policy "post_media_auth_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 1) in ('public', 'dm')
  );

create policy "post_media_auth_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 1) in ('public', 'dm')
  )
  with check (
    bucket_id = 'post-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 1) in ('public', 'dm')
  );

create policy "post_media_auth_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 1) in ('public', 'dm')
  );

notify pgrst, 'reload schema';
