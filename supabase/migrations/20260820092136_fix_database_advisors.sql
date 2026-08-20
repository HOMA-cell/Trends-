-- Resolve database advisor findings without changing application data.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create index if not exists comments_user_id_idx
  on public.comments(user_id);

create index if not exists notifications_actor_id_idx
  on public.notifications(actor_id);

create index if not exists notifications_post_id_idx
  on public.notifications(post_id);

-- Keep constraint-backed indexes and remove only redundant standalone copies.
drop index if exists public.exercise_prs_user_exercise_unique_idx;
drop index if exists public.follows_unique_pair_idx;
drop index if exists public.post_likes_unique_pair_idx;
