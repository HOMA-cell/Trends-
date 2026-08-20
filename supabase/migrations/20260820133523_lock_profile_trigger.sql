-- This SECURITY DEFINER function is trigger-only and must not be callable via RPC.
revoke execute on function public.ensure_profile_for_new_user()
  from public, anon, authenticated;
