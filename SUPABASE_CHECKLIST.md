# Supabase Production Checklist

Use this after running:
`/Users/homare/Documents/Trends-/supabase/migrations/20260207_000001_baseline_schema_and_policies.sql`

## 1) Migration apply

1. Open Supabase Dashboard -> SQL Editor.
2. Run the migration SQL.
3. Confirm there are no errors.

## 2) Verify tables exist

Run:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'posts',
    'comments',
    'follows',
    'post_likes',
    'workout_templates',
    'workout_sets',
    'notifications',
    'exercise_prs'
  )
order by tablename;
```

## 3) Verify RLS is enabled

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'posts',
    'comments',
    'follows',
    'post_likes',
    'workout_templates',
    'workout_sets',
    'notifications',
    'exercise_prs'
  )
order by tablename;
```

All rows should return `rowsecurity = true`.

## 4) Verify storage buckets

```sql
select id, name, public
from storage.buckets
where id in ('avatars', 'post-media');
```

Both buckets should exist and be `public = true`.

## 5) Verify critical unique constraints

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'follows_unique_pair_idx',
    'post_likes_unique_pair_idx',
    'exercise_prs_user_exercise_unique_idx'
  )
order by indexname;
```

## 6) Functional smoke test on deployed app

1. Sign up / log in.
2. Update profile (display name + avatar upload).
3. Create post with:
   - text only
   - image/video
   - workout sets
4. Add a comment.
5. Like/unlike a post.
6. Follow/unfollow another user.
7. Confirm notifications appear and can be marked read.
8. Confirm private posts are visible only to owner.

## 7) Security check

1. Open app in logged-out mode.
2. Confirm:
   - public posts are visible,
   - private posts are not visible,
   - write actions require login.

