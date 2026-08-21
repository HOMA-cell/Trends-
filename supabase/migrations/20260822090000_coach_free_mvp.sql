-- Coach Free MVP reuses existing profiles, posts, auth, blocks, and DM.
-- Paid coaching, verification, memberships, and analytics are intentionally absent.

create table if not exists public.coach_profiles (
  user_id uuid primary key
    constraint coach_profiles_user_id_fkey
    references public.profiles(id) on delete cascade,
  headline text not null default '',
  about text not null default '',
  specialties text[] not null default '{}'::text[],
  service_area text,
  experience_years smallint,
  online_available boolean not null default false,
  in_person_available boolean not null default false,
  accepting_inquiries boolean not null default true,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_profiles_headline_check
    check (char_length(trim(headline)) <= 120),
  constraint coach_profiles_about_check
    check (char_length(trim(about)) <= 1600),
  constraint coach_profiles_specialties_check check (
    cardinality(specialties) <= 8
    and char_length(array_to_string(specialties, '')) <= 400
  ),
  constraint coach_profiles_service_area_check
    check (service_area is null or char_length(trim(service_area)) <= 120),
  constraint coach_profiles_experience_check
    check (experience_years is null or experience_years between 0 and 80),
  constraint coach_profiles_status_check
    check (status in ('draft', 'published', 'paused')),
  constraint coach_profiles_published_fields_check check (
    status <> 'published'
    or (
      char_length(trim(headline)) between 5 and 120
      and char_length(trim(about)) between 20 and 1600
      and cardinality(specialties) between 1 and 8
      and (online_available or in_person_available)
    )
  )
);

create index if not exists coach_profiles_directory_idx
  on public.coach_profiles (status, accepting_inquiries, updated_at desc);

drop trigger if exists trg_coach_profiles_updated_at on public.coach_profiles;
create trigger trg_coach_profiles_updated_at
before update on public.coach_profiles
for each row execute function public.set_updated_at();

create table if not exists public.coach_inquiries (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null
    constraint coach_inquiries_coach_user_id_fkey
    references public.profiles(id) on delete cascade,
  sender_user_id uuid not null
    constraint coach_inquiries_sender_user_id_fkey
    references public.profiles(id) on delete cascade,
  topic text not null default 'other',
  message text not null,
  status text not null default 'new',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_inquiries_participants_check
    check (coach_user_id <> sender_user_id),
  constraint coach_inquiries_topic_check
    check (topic in ('programming', 'form_check', 'online', 'in_person', 'other')),
  constraint coach_inquiries_message_check
    check (char_length(trim(message)) between 20 and 1500),
  constraint coach_inquiries_status_check
    check (status in ('new', 'read', 'closed')),
  constraint coach_inquiries_read_state_check check (
    status = 'new' or read_at is not null
  )
);

create index if not exists coach_inquiries_coach_inbox_idx
  on public.coach_inquiries (coach_user_id, status, created_at desc);
create index if not exists coach_inquiries_sender_history_idx
  on public.coach_inquiries (sender_user_id, created_at desc);

drop trigger if exists trg_coach_inquiries_updated_at on public.coach_inquiries;
create trigger trg_coach_inquiries_updated_at
before update on public.coach_inquiries
for each row execute function public.set_updated_at();

create or replace function private.validate_coach_profile_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status = 'published' and not exists (
    select 1
    from public.profiles profile
    where profile.id = new.user_id
      and char_length(trim(coalesce(profile.display_name, ''))) between 1 and 80
      and char_length(trim(coalesce(profile.handle, ''))) between 1 and 40
  ) then
    raise exception 'Complete your display name and handle before publishing.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_coach_profile_publish() from public;

drop trigger if exists trg_validate_coach_profile_publish on public.coach_profiles;
create trigger trg_validate_coach_profile_publish
before insert or update on public.coach_profiles
for each row execute function private.validate_coach_profile_publish();

create or replace function private.validate_coach_inquiry_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or caller_id <> new.sender_user_id then
    raise exception 'Invalid inquiry sender.' using errcode = '42501';
  end if;

  if new.coach_user_id = new.sender_user_id then
    raise exception 'You cannot contact yourself.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.coach_profiles coach
    where coach.user_id = new.coach_user_id
      and coach.status = 'published'
      and coach.accepting_inquiries = true
  ) then
    raise exception 'This coach is not accepting inquiries.' using errcode = '23514';
  end if;

  if private.users_are_blocked(new.sender_user_id, new.coach_user_id) then
    raise exception 'Inquiry not permitted.' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.coach_inquiries inquiry
    where inquiry.sender_user_id = new.sender_user_id
      and inquiry.created_at >= now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too many inquiries. Please try again later.' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.coach_inquiries inquiry
    where inquiry.sender_user_id = new.sender_user_id
      and inquiry.created_at >= now() - interval '1 day'
  ) >= 20 then
    raise exception 'Daily inquiry limit reached.' using errcode = 'P0001';
  end if;

  new.status := 'new';
  new.read_at := null;
  return new;
end;
$$;

revoke all on function private.validate_coach_inquiry_insert() from public;

drop trigger if exists trg_validate_coach_inquiry_insert on public.coach_inquiries;
create trigger trg_validate_coach_inquiry_insert
before insert on public.coach_inquiries
for each row execute function private.validate_coach_inquiry_insert();

alter table public.coach_profiles enable row level security;
alter table public.coach_inquiries enable row level security;

drop policy if exists "coach_profiles_select_visible" on public.coach_profiles;
create policy "coach_profiles_select_visible"
  on public.coach_profiles for select
  to anon, authenticated
  using (
    (
      status = 'published'
      and (
        (select auth.uid()) is null
        or not private.users_are_blocked((select auth.uid()), user_id)
      )
    )
    or (select auth.uid()) = user_id
  );

drop policy if exists "coach_profiles_insert_own" on public.coach_profiles;
create policy "coach_profiles_insert_own"
  on public.coach_profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "coach_profiles_update_own" on public.coach_profiles;
create policy "coach_profiles_update_own"
  on public.coach_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "coach_profiles_delete_own" on public.coach_profiles;
create policy "coach_profiles_delete_own"
  on public.coach_profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "coach_inquiries_select_participants" on public.coach_inquiries;
create policy "coach_inquiries_select_participants"
  on public.coach_inquiries for select
  to authenticated
  using (
    (select auth.uid()) in (sender_user_id, coach_user_id)
    and not private.users_are_blocked(sender_user_id, coach_user_id)
  );

drop policy if exists "coach_inquiries_insert_sender" on public.coach_inquiries;
create policy "coach_inquiries_insert_sender"
  on public.coach_inquiries for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_user_id
    and sender_user_id <> coach_user_id
    and not private.users_are_blocked(sender_user_id, coach_user_id)
    and exists (
      select 1
      from public.coach_profiles coach
      where coach.user_id = coach_user_id
        and coach.status = 'published'
        and coach.accepting_inquiries = true
    )
  );

drop policy if exists "coach_inquiries_update_coach" on public.coach_inquiries;
create policy "coach_inquiries_update_coach"
  on public.coach_inquiries for update
  to authenticated
  using (
    (select auth.uid()) = coach_user_id
    and not private.users_are_blocked(sender_user_id, coach_user_id)
  )
  with check (
    (select auth.uid()) = coach_user_id
    and not private.users_are_blocked(sender_user_id, coach_user_id)
  );

revoke all on table public.coach_profiles from anon, authenticated;
revoke all on table public.coach_inquiries from anon, authenticated;

grant select on table public.coach_profiles to anon, authenticated;
grant insert, update, delete on table public.coach_profiles to authenticated;
grant select, insert on table public.coach_inquiries to authenticated;
grant update (status, read_at) on table public.coach_inquiries to authenticated;

insert into public.app_feature_flags (
  key,
  enabled,
  rollout_percent,
  config,
  is_public
)
values
  (
    'coach_directory',
    true,
    100,
    '{"free_mvp":true,"paid_features":false}'::jsonb,
    true
  ),
  (
    'coach_inquiries',
    true,
    100,
    '{"hourly_limit":5,"daily_limit":20}'::jsonb,
    true
  )
on conflict (key) do update set
  enabled = excluded.enabled,
  rollout_percent = excluded.rollout_percent,
  config = excluded.config,
  is_public = excluded.is_public,
  updated_at = now();

