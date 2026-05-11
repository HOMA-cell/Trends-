# Security Notes

This app is designed as a static frontend backed by Supabase.

## What is already in place

- Frontend ships only the Supabase `anon` key.
- Database tables use RLS policies.
- Storage buckets use authenticated write policies scoped to each user path.
- Vercel deploys now set baseline security headers.
- Advanced runtime override tools are hidden on production by default.
- Logout clears local feed/comment/like caches to reduce shared-device leakage.

## Required manual checks before real users

## 1) Supabase Auth

Check these in Supabase Dashboard:

- Site URL is the real production URL.
- Redirect URLs only include trusted local and production hosts.
- Email confirmation is set the way you want for launch.
- Rate limits are enabled for sign-in / sign-up.
- Leaked password protection and bot protection are reviewed.

## 2) Database and storage

Apply all production migrations:

- `supabase/migrations/20260207_000001_baseline_schema_and_policies.sql`
- `supabase/migrations/20260314_000001_direct_messages.sql`
- `supabase/migrations/20260318_000001_direct_messages_media.sql`

Then confirm:

- RLS is enabled on all public tables.
- `avatars` and `post-media` buckets exist.
- Uploaded files in public buckets are intended to be public.

## 3) App-level checks

Run:

```bash
cd /path/to/Trends-
npm run security
npm run preflight
```

Then verify in the app:

- `Settings > Data tools > Launch readiness`
- `Live site URL` points at production.
- `Supabase connectivity` is healthy.
- `Build` is not `dev-local` after deploy.
- `Runtime issues` stays empty during smoke tests.

## 4) Shared-device privacy

The app clears key local caches on logout, but shared devices still need normal user hygiene:

- always log out after testing,
- avoid saving browser passwords on shared machines,
- hard refresh if you changed production hosts or Supabase config.
