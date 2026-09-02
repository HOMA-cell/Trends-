-- Closed-beta admission, durable moderation, and first-party beta operations.

create schema if not exists private;
revoke all on schema private from public;

-- Auth hook allowlist. No browser-facing role receives table access.
create table if not exists private.beta_signup_allowlist (
  email text primary key,
  status text not null default 'active',
  expires_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_signup_allowlist_email_check check (
    email = lower(trim(email))
    and char_length(email) between 3 and 320
    and position('@' in email) > 1
  ),
  constraint beta_signup_allowlist_status_check
    check (status in ('active', 'revoked')),
  constraint beta_signup_allowlist_note_check
    check (note is null or char_length(note) <= 500)
);

create index if not exists beta_signup_allowlist_invited_by_idx
  on private.beta_signup_allowlist (invited_by)
  where invited_by is not null;

alter table private.beta_signup_allowlist enable row level security;

drop policy if exists "beta_signup_allowlist_auth_hook_read"
  on private.beta_signup_allowlist;
create policy "beta_signup_allowlist_auth_hook_read"
  on private.beta_signup_allowlist for select
  to supabase_auth_admin
  using (true);

revoke all on table private.beta_signup_allowlist
  from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant select on table private.beta_signup_allowlist to supabase_auth_admin;

create or replace function private.hook_restrict_beta_signups(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  signup_email text;
begin
  signup_email := lower(trim(event -> 'user' ->> 'email'));

  if signup_email is not null and exists (
    select 1
    from private.beta_signup_allowlist invite
    where invite.email = signup_email
      and invite.status = 'active'
      and (invite.expires_at is null or invite.expires_at > now())
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'closed_beta_invite_required'
    )
  );
end;
$$;

revoke all on function private.hook_restrict_beta_signups(jsonb)
  from public, anon, authenticated;
grant execute on function private.hook_restrict_beta_signups(jsonb)
  to supabase_auth_admin;

-- Moderation state lives outside the Data API and cannot be reset by post owners.
create table if not exists private.content_moderation (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  state text not null default 'hidden',
  reason text not null,
  moderator_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_moderation_target_unique unique (target_type, target_id),
  constraint content_moderation_target_type_check
    check (target_type in ('post', 'comment')),
  constraint content_moderation_state_check
    check (state in ('hidden', 'visible')),
  constraint content_moderation_reason_check
    check (char_length(trim(reason)) between 3 and 500)
);

create index if not exists content_moderation_state_idx
  on private.content_moderation (state, updated_at desc);
create index if not exists content_moderation_moderator_idx
  on private.content_moderation (moderator_id)
  where moderator_id is not null;

alter table private.content_moderation enable row level security;
revoke all on table private.content_moderation
  from public, anon, authenticated;

create or replace function private.is_content_hidden(
  requested_type text,
  requested_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.content_moderation moderation
    where moderation.target_type = requested_type
      and moderation.target_id = requested_id
      and moderation.state = 'hidden'
  );
$$;

revoke all on function private.is_content_hidden(text, uuid) from public;
grant execute on function private.is_content_hidden(text, uuid)
  to anon, authenticated;

-- Preserve the current visibility and block rules while enforcing moderation.
drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
  on public.posts for select
  to anon, authenticated
  using (
    not private.is_content_hidden('post', id)
    and (visibility <> 'private' or (select auth.uid()) = user_id)
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
    not private.is_content_hidden('comment', id)
    and (
      (select auth.uid()) is null
      or user_id = (select auth.uid())
      or not private.users_are_blocked((select auth.uid()), user_id)
    )
    and exists (
      select 1
      from public.posts post
      where post.id = comments.post_id
        and not private.is_content_hidden('post', post.id)
        and (post.visibility <> 'private' or post.user_id = (select auth.uid()))
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
      from public.posts post
      where post.id = comments.post_id
        and not private.is_content_hidden('post', post.id)
        and (post.visibility <> 'private' or post.user_id = (select auth.uid()))
        and not private.users_are_blocked((select auth.uid()), post.user_id)
    )
  );

drop policy if exists "post_likes_select_visible_posts" on public.post_likes;
create policy "post_likes_select_visible_posts"
  on public.post_likes for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts post
      where post.id = post_likes.post_id
        and not private.is_content_hidden('post', post.id)
        and (post.visibility <> 'private' or post.user_id = (select auth.uid()))
        and (
          (select auth.uid()) is null
          or not private.users_are_blocked((select auth.uid()), post.user_id)
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
      from public.posts post
      where post.id = post_likes.post_id
        and not private.is_content_hidden('post', post.id)
        and (post.visibility <> 'private' or post.user_id = (select auth.uid()))
        and not private.users_are_blocked((select auth.uid()), post.user_id)
    )
  );

drop policy if exists "workout_sets_select_visible_posts" on public.workout_sets;
create policy "workout_sets_select_visible_posts"
  on public.workout_sets for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts post
      where post.id = workout_sets.post_id
        and not private.is_content_hidden('post', post.id)
        and (post.visibility <> 'private' or post.user_id = (select auth.uid()))
        and (
          (select auth.uid()) is null
          or post.user_id = (select auth.uid())
          or not private.users_are_blocked((select auth.uid()), post.user_id)
        )
    )
  );

-- Minimal first-party product events. Browser roles can insert only their own rows.
create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_events_name_check
    check (event_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint app_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 4096
  )
);

create index if not exists app_events_user_created_idx
  on public.app_events (user_id, created_at desc);
create index if not exists app_events_name_created_idx
  on public.app_events (event_name, created_at desc);

alter table public.app_events enable row level security;

drop policy if exists "app_events_insert_own" on public.app_events;
create policy "app_events_insert_own"
  on public.app_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.app_events from public, anon, authenticated;
grant insert on table public.app_events to authenticated;

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  category text not null,
  message text not null,
  page text,
  build_version text,
  created_at timestamptz not null default now(),
  constraint beta_feedback_category_check
    check (category in ('bug', 'idea', 'usability', 'other')),
  constraint beta_feedback_message_check
    check (char_length(trim(message)) between 10 and 2000),
  constraint beta_feedback_page_check
    check (page is null or char_length(page) <= 300),
  constraint beta_feedback_build_check
    check (build_version is null or char_length(build_version) <= 100)
);

create index if not exists beta_feedback_created_idx
  on public.beta_feedback (created_at desc);
create index if not exists beta_feedback_user_created_idx
  on public.beta_feedback (user_id, created_at desc);

alter table public.beta_feedback enable row level security;

drop policy if exists "beta_feedback_insert_own" on public.beta_feedback;
create policy "beta_feedback_insert_own"
  on public.beta_feedback for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.beta_feedback from public, anon, authenticated;
grant insert on table public.beta_feedback to authenticated;

notify pgrst, 'reload schema';
