-- Enforce the same safety limits on the server that the browser already applies.
update storage.buckets
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]
where id = 'avatars';

update storage.buckets
set public = true,
    file_size_limit = 31457280,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'video/webm'
    ]
where id = 'post-media';

-- A blocked user must not be able to enumerate who blocked them.
drop policy if exists "user_blocks_select_participant" on public.user_blocks;
drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own"
  on public.user_blocks for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_text_lengths_check'
  ) then
    alter table public.profiles
      add constraint profiles_text_lengths_check check (
        (handle is null or char_length(handle) between 1 and 40)
        and (display_name is null or char_length(display_name) <= 80)
        and (bio is null or char_length(bio) <= 500)
        and (location is null or char_length(location) <= 120)
        and (training_goal is null or char_length(training_goal) <= 160)
        and (gym is null or char_length(gym) <= 160)
        and (training_split is null or char_length(training_split) <= 160)
        and (favorite_lifts is null or char_length(favorite_lifts) <= 500)
        and (avatar_url is null or char_length(avatar_url) <= 2048)
        and (banner_url is null or char_length(banner_url) <= 2048)
        and (instagram is null or char_length(instagram) <= 2048)
        and (tiktok is null or char_length(tiktok) <= 2048)
        and (youtube is null or char_length(youtube) <= 2048)
        and (website is null or char_length(website) <= 2048)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_height_check'
  ) then
    alter table public.profiles
      add constraint profiles_height_check check (
        height_cm is null or height_cm between 80 and 300
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_visibility_check'
  ) then
    alter table public.posts
      add constraint posts_visibility_check
      check (visibility in ('public', 'private'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_media_type_check'
  ) then
    alter table public.posts
      add constraint posts_media_type_check
      check (media_type is null or media_type in ('image', 'video'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_content_limits_check'
  ) then
    alter table public.posts
      add constraint posts_content_limits_check check (
        (note is null or char_length(note) <= 2200)
        and (caption is null or char_length(caption) <= 2200)
        and (media_url is null or char_length(media_url) <= 2048)
        and (media_thumbnail_url is null or char_length(media_thumbnail_url) <= 2048)
        and (bodyweight is null or bodyweight between 1 and 1000)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_private_media_check'
  ) then
    alter table public.posts
      add constraint posts_private_media_check check (
        visibility <> 'private'
        or (
          media_type is null
          and media_url is null
          and media_thumbnail_url is null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comments'::regclass
      and conname = 'comments_body_check'
  ) then
    alter table public.comments
      add constraint comments_body_check
      check (char_length(trim(body)) between 1 and 1000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.direct_messages'::regclass
      and conname = 'direct_messages_body_length_check'
  ) then
    alter table public.direct_messages
      add constraint direct_messages_body_length_check
      check (char_length(trim(body)) between 1 and 2000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check'
  ) then
    alter table public.notifications
      add constraint notifications_type_check
      check (type in ('like', 'comment', 'follow'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workout_sets'::regclass
      and conname = 'workout_sets_values_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_values_check check (
        char_length(trim(exercise)) between 1 and 120
        and set_index between 1 and 200
        and reps between 1 and 10000
        and (weight is null or weight between 0 and 2000)
        and (rest_seconds is null or rest_seconds between 0 and 86400)
        and (exercise_note is null or char_length(exercise_note) <= 500)
        and (pr_type is null or pr_type in ('weight', 'reps', 'both'))
      );
  end if;
end
$$;

notify pgrst, 'reload schema';
