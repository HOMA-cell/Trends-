-- Keep block-list profile labels available without exposing user_blocks to anon.
create or replace function private.current_user_blocked(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and target_user is not null
    and exists (
      select 1
      from public.user_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = target_user
    );
$$;

revoke all on function private.current_user_blocked(uuid) from public;
grant execute on function private.current_user_blocked(uuid) to anon, authenticated;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible"
  on public.profiles for select
  to anon, authenticated
  using (
    (select auth.uid()) is null
    or id = (select auth.uid())
    or private.current_user_blocked(id)
    or not private.users_are_blocked((select auth.uid()), id)
  );

notify pgrst, 'reload schema';
