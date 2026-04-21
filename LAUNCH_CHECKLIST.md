# Launch Checklist

Use this when we are about to let real users in.

## 1) Local preflight

```bash
cd /Users/homare/Documents/Trends-
npm ci
npm run preflight
```

Expected:

- Node 22
- `doctor` passes
- syntax checks pass
- deploy metadata can be generated

## 2) Supabase

Run:

- `/Users/homare/Documents/Trends-/supabase/migrations/20260207_000001_baseline_schema_and_policies.sql`
- `/Users/homare/Documents/Trends-/supabase/migrations/20260314_000001_direct_messages.sql`
- `/Users/homare/Documents/Trends-/supabase/migrations/20260318_000001_direct_messages_media.sql`

Then verify:

- storage buckets exist
- RLS is enabled
- DM tables exist
- comment / like / follow / notification tables exist

Reference:

- `/Users/homare/Documents/Trends-/SUPABASE_CHECKLIST.md`

## 3) Production deploy

1. Push `main`
2. Confirm GitHub CI passes
3. Confirm Vercel deploy succeeds
4. Open:
   - [https://trends-navy-psi.vercel.app/?fresh=1](https://trends-navy-psi.vercel.app/?fresh=1)

## 4) In-app production checks

Open:

- `設定 > 管理・ツール > データ管理`

Do:

1. Save `Live site URL`
2. Run `接続テスト`
3. Run `ライブ版を確認`
4. Check build version is not `dev-local`

## 5) Functional smoke test

With a real account:

1. Sign in
2. Update profile
3. Create:
   - text post
   - image/video post
   - workout post
4. Comment and reply
5. Like/unlike
6. Follow/unfollow
7. Open another profile
8. Start a DM
9. Send image / reply / reaction in DM
10. Open Shorts and comments
11. Confirm notifications arrive

## 6) Release decision

Safe to open to real users when all are true:

- `npm run preflight` passes
- CI is green
- Vercel is green
- Supabase migration is applied
- in-app live check is correct
- smoke test passes

## 7) Fallback

If Vercel has an incident:

- GitHub Pages workflow is available as manual fallback:
  - `/Users/homare/Documents/Trends-/.github/workflows/deploy-pages.yml`
