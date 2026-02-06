-- Baseline schema + RLS + storage policies for Trends app.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  location text,
  height_cm numeric,
  experience_level text,
  training_goal text,
  gym text,
  training_split text,
  favorite_lifts text,
  instagram text,
  tiktok text,
  youtube text,
  website text,
  accent_color text default '#e4572e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists handle text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists height_cm numeric;
alter table public.profiles add column if not exists experience_level text;
alter table public.profiles add column if not exists training_goal text;
alter table public.profiles add column if not exists gym text;
alter table public.profiles add column if not exists training_split text;
alter table public.profiles add column if not exists favorite_lifts text;
alter table public.profiles add column if not exists instagram text;
alter table public.profiles add column if not exists tiktok text;
alter table public.profiles add column if not exists youtube text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists accent_color text default '#e4572e';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_handle_unique_idx
  on public.profiles (lower(handle))
  where handle is not null;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date,
  bodyweight numeric,
  note text,
  caption text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts add column if not exists date date;
alter table public.posts add column if not exists bodyweight numeric;
alter table public.posts add column if not exists note text;
alter table public.posts add column if not exists caption text;
alter table public.posts add column if not exists media_url text;
alter table public.posts add column if not exists media_type text;
alter table public.posts add column if not exists visibility text not null default 'public';
alter table public.posts add column if not exists created_at timestamptz not null default now();
alter table public.posts add column if not exists updated_at timestamptz not null default now();

create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_date_idx on public.posts(date desc);
create index if not exists posts_visibility_idx on public.posts(visibility);

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.comments add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.comments add column if not exists body text;
alter table public.comments add column if not exists created_at timestamptz not null default now();
alter table public.comments add column if not exists updated_at timestamptz not null default now();

create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists comments_created_at_idx on public.comments(created_at asc);

drop trigger if exists trg_comments_updated_at on public.comments;
create trigger trg_comments_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

-- follows
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (follower_id <> following_id)
);

alter table public.follows add column if not exists follower_id uuid references auth.users(id) on delete cascade;
alter table public.follows add column if not exists following_id uuid references auth.users(id) on delete cascade;
alter table public.follows add column if not exists created_at timestamptz not null default now();

create unique index if not exists follows_unique_pair_idx
  on public.follows(follower_id, following_id);
create index if not exists follows_follower_id_idx on public.follows(follower_id);
create index if not exists follows_following_id_idx on public.follows(following_id);

-- post_likes
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.post_likes add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.post_likes add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.post_likes add column if not exists created_at timestamptz not null default now();

create unique index if not exists post_likes_unique_pair_idx
  on public.post_likes(post_id, user_id);
create index if not exists post_likes_post_id_idx on public.post_likes(post_id);
create index if not exists post_likes_user_id_idx on public.post_likes(user_id);

-- workout_templates
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_templates add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_templates add column if not exists name text;
alter table public.workout_templates add column if not exists body text;
alter table public.workout_templates add column if not exists created_at timestamptz not null default now();
alter table public.workout_templates add column if not exists updated_at timestamptz not null default now();

create index if not exists workout_templates_user_id_idx on public.workout_templates(user_id);
create index if not exists workout_templates_created_at_idx on public.workout_templates(created_at desc);

drop trigger if exists trg_workout_templates_updated_at on public.workout_templates;
create trigger trg_workout_templates_updated_at
before update on public.workout_templates
for each row execute function public.set_updated_at();

-- workout_sets
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  set_index integer not null,
  reps integer not null,
  weight numeric,
  rest_seconds integer,
  exercise_note text,
  pr_type text check (pr_type in ('weight', 'reps', 'both')),
  created_at timestamptz not null default now(),
  check (set_index > 0),
  check (reps > 0)
);

alter table public.workout_sets add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.workout_sets add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_sets add column if not exists exercise text;
alter table public.workout_sets add column if not exists set_index integer;
alter table public.workout_sets add column if not exists reps integer;
alter table public.workout_sets add column if not exists weight numeric;
alter table public.workout_sets add column if not exists rest_seconds integer;
alter table public.workout_sets add column if not exists exercise_note text;
alter table public.workout_sets add column if not exists pr_type text;
alter table public.workout_sets add column if not exists created_at timestamptz not null default now();

create index if not exists workout_sets_post_id_idx on public.workout_sets(post_id);
create index if not exists workout_sets_user_id_idx on public.workout_sets(user_id);
create index if not exists workout_sets_exercise_idx on public.workout_sets(exercise);

-- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('like', 'comment', 'follow')),
  post_id uuid references public.posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.notifications add column if not exists actor_id uuid references auth.users(id) on delete cascade;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

-- exercise_prs
create table if not exists public.exercise_prs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  best_weight numeric,
  best_reps integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercise_prs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.exercise_prs add column if not exists exercise text;
alter table public.exercise_prs add column if not exists best_weight numeric;
alter table public.exercise_prs add column if not exists best_reps integer;
alter table public.exercise_prs add column if not exists created_at timestamptz not null default now();
alter table public.exercise_prs add column if not exists updated_at timestamptz not null default now();

create unique index if not exists exercise_prs_user_exercise_unique_idx
  on public.exercise_prs(user_id, exercise);
create index if not exists exercise_prs_user_id_idx on public.exercise_prs(user_id);

drop trigger if exists trg_exercise_prs_updated_at on public.exercise_prs;
create trigger trg_exercise_prs_updated_at
before update on public.exercise_prs
for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.post_likes enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_sets enable row level security;
alter table public.notifications enable row level security;
alter table public.exercise_prs enable row level security;

-- profiles policies
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  using (auth.uid() = id);

-- posts policies
drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
  on public.posts
  for select
  using (
    visibility <> 'private'
    or auth.uid() = user_id
  );

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
  on public.posts
  for delete
  using (auth.uid() = user_id);

-- comments policies
drop policy if exists "comments_select_visible_posts" on public.comments;
create policy "comments_select_visible_posts"
  on public.comments
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and (p.visibility <> 'private' or p.user_id = auth.uid())
    )
  );

drop policy if exists "comments_insert_own_visible_posts" on public.comments;
create policy "comments_insert_own_visible_posts"
  on public.comments
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and (p.visibility <> 'private' or p.user_id = auth.uid())
    )
  );

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own"
  on public.comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
  on public.comments
  for delete
  using (auth.uid() = user_id);

-- follows policies
drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all"
  on public.follows
  for select
  using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows
  for insert
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
  );

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows
  for delete
  using (auth.uid() = follower_id);

-- post_likes policies
drop policy if exists "post_likes_select_all" on public.post_likes;
create policy "post_likes_select_all"
  on public.post_likes
  for select
  using (true);

drop policy if exists "post_likes_insert_own_visible_post" on public.post_likes;
create policy "post_likes_insert_own_visible_post"
  on public.post_likes
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = post_likes.post_id
        and (p.visibility <> 'private' or p.user_id = auth.uid())
    )
  );

drop policy if exists "post_likes_delete_own" on public.post_likes;
create policy "post_likes_delete_own"
  on public.post_likes
  for delete
  using (auth.uid() = user_id);

-- workout_templates policies
drop policy if exists "workout_templates_select_own" on public.workout_templates;
create policy "workout_templates_select_own"
  on public.workout_templates
  for select
  using (auth.uid() = user_id);

drop policy if exists "workout_templates_insert_own" on public.workout_templates;
create policy "workout_templates_insert_own"
  on public.workout_templates
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "workout_templates_update_own" on public.workout_templates;
create policy "workout_templates_update_own"
  on public.workout_templates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_templates_delete_own" on public.workout_templates;
create policy "workout_templates_delete_own"
  on public.workout_templates
  for delete
  using (auth.uid() = user_id);

-- workout_sets policies
drop policy if exists "workout_sets_select_visible_posts" on public.workout_sets;
create policy "workout_sets_select_visible_posts"
  on public.workout_sets
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = workout_sets.post_id
        and (p.visibility <> 'private' or p.user_id = auth.uid())
    )
  );

drop policy if exists "workout_sets_insert_own_post" on public.workout_sets;
create policy "workout_sets_insert_own_post"
  on public.workout_sets
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = workout_sets.post_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "workout_sets_update_own" on public.workout_sets;
create policy "workout_sets_update_own"
  on public.workout_sets
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_sets_delete_own" on public.workout_sets;
create policy "workout_sets_delete_own"
  on public.workout_sets
  for delete
  using (auth.uid() = user_id);

-- notifications policies
drop policy if exists "notifications_select_target_user" on public.notifications;
create policy "notifications_select_target_user"
  on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_insert_actor" on public.notifications;
create policy "notifications_insert_actor"
  on public.notifications
  for insert
  with check (
    auth.uid() = actor_id
    and user_id <> actor_id
  );

drop policy if exists "notifications_update_target_user" on public.notifications;
create policy "notifications_update_target_user"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_target_user" on public.notifications;
create policy "notifications_delete_target_user"
  on public.notifications
  for delete
  using (auth.uid() = user_id);

-- exercise_prs policies
drop policy if exists "exercise_prs_select_own" on public.exercise_prs;
create policy "exercise_prs_select_own"
  on public.exercise_prs
  for select
  using (auth.uid() = user_id);

drop policy if exists "exercise_prs_insert_own" on public.exercise_prs;
create policy "exercise_prs_insert_own"
  on public.exercise_prs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "exercise_prs_update_own" on public.exercise_prs;
create policy "exercise_prs_update_own"
  on public.exercise_prs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "exercise_prs_delete_own" on public.exercise_prs;
create policy "exercise_prs_delete_own"
  on public.exercise_prs
  for delete
  using (auth.uid() = user_id);

-- storage buckets
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update set public = excluded.public;

-- storage.objects policies for avatars
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_auth_upload_own" on storage.objects;
create policy "avatars_auth_upload_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "avatars_auth_update_own" on storage.objects;
create policy "avatars_auth_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "avatars_auth_delete_own" on storage.objects;
create policy "avatars_auth_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- storage.objects policies for post-media
drop policy if exists "post_media_public_read" on storage.objects;
create policy "post_media_public_read"
  on storage.objects
  for select
  using (bucket_id = 'post-media');

drop policy if exists "post_media_auth_upload_own" on storage.objects;
create policy "post_media_auth_upload_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'post-media'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "post_media_auth_update_own" on storage.objects;
create policy "post_media_auth_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'post-media'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'post-media'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "post_media_auth_delete_own" on storage.objects;
create policy "post_media_auth_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'post-media'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = 'public'
    and split_part(name, '/', 2) = auth.uid()::text
  );
