# Deploy And Operate

Trends is a static app (`index.html` + JS/CSS) backed by Supabase.

## Production target

- Primary production host: Vercel
- Manual fallback host: GitHub Pages

The repo now assumes Vercel is the normal production path. GitHub Pages remains available, but only as a manual fallback workflow.

## 1) Local preflight

```bash
cd /path/to/Trends-
nvm use
npm ci
npm run security
npm run preflight
npm run ci
```

If `nvm use` is not available yet, install Node 22 first.

## 2) Supabase production setup

Before inviting real users, run:

- `supabase/migrations/20260207_000001_baseline_schema_and_policies.sql`
- `supabase/migrations/20260314_000001_direct_messages.sql`
- `supabase/migrations/20260318_000001_direct_messages_media.sql`

Then walk through `SUPABASE_CHECKLIST.md`.

## 3) Vercel setup

1. Connect the repo to Vercel
2. Framework preset:
   - `Other`
3. Install command:
   - `npm ci`
4. Build command:
   - `npm run prepare:deploy`
5. Output directory:
   - `.`

This repo also includes `vercel.json`, so Vercel should pick these defaults up automatically.

### What Vercel build does

- Writes `build-meta.json`
- Uses `VERCEL_GIT_COMMIT_SHA` when available
- Keeps app version checks and "App update" flow accurate in production

## 4) Normal release flow

```bash
cd /path/to/Trends-
git add -A
git commit -m "Your update message"
git push origin main
```

After push:

- GitHub CI runs
- Vercel deploys production

## 5) Post-deploy checks

1. Open production:
   - `https://trends-navy-psi.vercel.app/?fresh=1`
2. Open local preview:
   - `http://127.0.0.1:8000/?fresh=1`
3. In the app, open:
   - `設定 > 管理・ツール > データ管理`
4. Save the real production URL in `Live site URL`
5. Run:
   - `接続テスト`
   - `ライブ版を確認`
6. Confirm:
   - build version is not `dev-local`
   - live check reports the expected version
   - sign in / profile / feed / comments / DM all work

For the full go-live flow, use:

- `LAUNCH_CHECKLIST.md`

## 6) If users see stale files

This app uses a service worker.

Inside the app:

1. `設定 > 管理・ツール > データ管理`
2. `キャッシュを削除`
3. `アプリを最新化`

If needed, hard refresh after that.

## 7) GitHub Pages fallback

There is still a Pages workflow:

- `.github/workflows/deploy-pages.yml`

But it is now manual-only on purpose, so normal releases do not spam Pages deployment failures.

Use it only when you intentionally want a static fallback deployment.

## 8) Safety reminders

- `anon` key is allowed in frontend only with proper RLS
- never place `service_role` in frontend code
- advanced runtime override tools are hidden on production unless you open the app with `?ops=1`
- keep production URL saved in app settings if you switch domains
- run `npm run preflight` after major env or deploy changes
- review `SECURITY.md` before inviting real users
