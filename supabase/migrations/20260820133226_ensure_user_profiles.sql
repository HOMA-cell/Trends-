-- Ensure every Auth user has a public profile row for feeds, follows, and DMs.
create or replace function public.ensure_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    handle,
    display_name,
    created_at,
    updated_at
  )
  values (
    new.id,
    'user_' || replace(new.id::text, '-', ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      'User'
    ),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ensure_profile on auth.users;

create trigger on_auth_user_created_ensure_profile
  after insert on auth.users
  for each row execute function public.ensure_profile_for_new_user();

insert into public.profiles (
  id,
  handle,
  display_name,
  created_at,
  updated_at
)
select
  u.id,
  'user_' || replace(u.id::text, '-', ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    'User'
  ),
  coalesce(u.created_at, now()),
  now()
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
